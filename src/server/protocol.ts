import http from 'http';
import {
    DpmError,
    InvalidIdError,
    InvalidPackageError,
    isValidId,
    Package,
    RejectedError,
    ResolveError,
} from '../core';

/**
 * Building blocks for writing a DPM-protocol server (see docs/protocol.md).
 *
 * DPM is a protocol: every server must speak these endpoints and check hashes, but what a server
 * *accepts* is its own policy. The reference server (`createServer`) is one assembly of these parts.
 * A server with a different policy (e.g. a logic server, which also runs the logic checker) assembles its own.
 */

/** An error that maps directly to an HTTP status. */
export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

/** The protocol's endpoints. */
export type Route =
    { kind: 'health' } | { kind: 'list' } | { kind: 'get'; id: string } | { kind: 'has' } | { kind: 'push' };

/** Matches a request to a protocol endpoint, or undefined if it isn't one. */
export function matchRoute(req: http.IncomingMessage): Route | undefined {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    if (method === 'GET' && pathname === '/health') return { kind: 'health' };
    if (method === 'GET' && pathname === '/packages') return { kind: 'list' };
    if (method === 'POST' && pathname === '/packages/has') return { kind: 'has' };
    if (method === 'POST' && pathname === '/packages') return { kind: 'push' };
    if (method === 'GET' && pathname.startsWith('/packages/')) {
        const id = decodeURIComponent(pathname.slice('/packages/'.length));
        if (!isValidId(id)) throw new HttpError(400, `Invalid package ID: ${id}`);
        return { kind: 'get', id };
    }
    return undefined;
}

/** Reads a JSON object body, enforcing a size limit. */
export async function readJson(req: http.IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
        chunks.push(chunk as Buffer);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new HttpError(400, 'Request body is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new HttpError(400, 'Request body must be a JSON object');
    return parsed as Record<string, unknown>;
}

function stringArray(value: unknown, field: string): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))
        throw new HttpError(400, `'${field}' must be an array of strings`);
    return value as string[];
}

/** Parses a `POST /packages/has` body: `{ ids }`. */
export function parseHasRequest(body: Record<string, unknown>): string[] {
    return stringArray(body.ids, 'ids');
}

export interface PushRequest {
    /** The pushed packages, already hash-verified against their claimed IDs. */
    packages: Package[];
    /** Registry URLs where dependencies may be found. */
    providers: string[];
}

/**
 * Parses a `POST /packages` body: `{ packages: [{ id, data }], providers }`.
 *
 * Hash verification happens here, first, as the protocol requires: every package's bytes must hash
 * to its claimed ID, or the whole request fails with 400 before anything else is done.
 */
export function parsePushRequest(body: Record<string, unknown>): PushRequest {
    if (!Array.isArray(body.packages)) throw new HttpError(400, `'packages' must be an array of { id, data }`);
    const packages = body.packages.map((entry: unknown) => {
        const { id, data } = (entry ?? {}) as { id?: unknown; data?: unknown };
        if (typeof id !== 'string' || typeof data !== 'string')
            throw new HttpError(400, 'Each pushed package must be { id: string, data: base64 string }');
        return Package.decodeAs(Buffer.from(data, 'base64'), id);
    });
    const providers = stringArray(body.providers, 'providers').map((raw) => {
        if (!URL.canParse(raw)) throw new HttpError(400, `Invalid provider URL: ${raw}`);
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            throw new HttpError(400, `Provider URL must be http or https: ${raw}`);
        return url.toString();
    });
    return { packages, providers };
}

/** Sends a JSON response. */
export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
}

/** Sends a package's raw bytes (the `GET /packages/:id` response). */
export function sendPackage(res: http.ServerResponse, pkg: Package): void {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': pkg.bytes.length });
    res.end(pkg.bytes);
}

/**
 * The protocol's error → status mapping:
 * 400 malformed request or hash mismatch, 413 too large, 422 not accepted (doesn't resolve, or
 * rejected by the server's policy via `RejectedError`), 404 unknown, 500 anything else.
 */
export function statusFor(e: unknown): number {
    if (e instanceof HttpError) return e.status;
    if (e instanceof InvalidPackageError || e instanceof InvalidIdError) return 400;
    if (e instanceof ResolveError || e instanceof RejectedError) return 422;
    return 500;
}

/** Sends `{ error }` with the protocol status for `e`. Internal errors are logged, not exposed. */
export function sendError(res: http.ServerResponse, e: unknown): void {
    const status = statusFor(e);
    if (status === 500) console.error(e);
    const message = e instanceof HttpError || e instanceof DpmError ? e.message : 'Internal server error';
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.destroy();
}

/** Wraps an async handler so any thrown error becomes a protocol error response. */
export function handle(
    fn: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
): http.RequestListener {
    return (req, res) => {
        fn(req, res).catch((e: unknown) => sendError(res, e));
    };
}
