import http from 'http';
import {
    DpmError,
    ingest,
    InvalidIdError,
    InvalidPackageError,
    isValidId,
    Package,
    Registry,
    RejectedError,
    RemoteRegistry,
    ResolveError,
    Verifier,
} from '../core';

export interface ServerOptions {
    /** Where accepted packages are stored. */
    registry: Registry;
    /**
     * Optional admission check between resolve and put. This is where a layer above DPM
     * (e.g. a logic validator) plugs in; plain DPM accepts anything that resolves.
     */
    verify?: Verifier;
    /** Largest accepted request body, in bytes. Default 64 MiB. */
    maxBodyBytes?: number;
    /**
     * Whether pushers may name provider registries for the server to fetch missing dependencies from.
     * When false, every dependency must already be on this server or in the pushed batch. Default true.
     */
    allowProviders?: boolean;
    /** Most provider URLs accepted per push. Default 16. */
    maxProviders?: number;
}

class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
}

async function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > limit) throw new HttpError(413, `Request body exceeds ${limit} bytes`);
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

async function readJson(req: http.IncomingMessage, limit: number): Promise<Record<string, unknown>> {
    const raw = await readBody(req, limit);
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.toString('utf8'));
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

function providerUrl(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new HttpError(400, `Invalid provider URL: ${raw}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new HttpError(400, `Provider URL must be http or https: ${raw}`);
    return url.toString();
}

function statusFor(e: unknown): number {
    if (e instanceof HttpError) return e.status;
    if (e instanceof InvalidPackageError || e instanceof InvalidIdError) return 400;
    if (e instanceof ResolveError || e instanceof RejectedError) return 422;
    return 500;
}

/** Builds the request handler for a DPM registry server. */
export function createHandler(options: ServerOptions): http.RequestListener {
    const { registry, verify } = options;
    const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024 * 1024;
    const allowProviders = options.allowProviders ?? true;
    const maxProviders = options.maxProviders ?? 16;

    async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const { pathname } = new URL(req.url ?? '/', 'http://localhost');
        const method = req.method ?? 'GET';

        if (method === 'GET' && pathname === '/health') return send(res, 200, { status: 'ok' });

        if (method === 'GET' && pathname === '/packages') return send(res, 200, { ids: await registry.list() });

        if (method === 'POST' && pathname === '/packages/has') {
            const ids = stringArray((await readJson(req, maxBodyBytes)).ids, 'ids');
            return send(res, 200, { ids: [...(await registry.has(ids))] });
        }

        if (method === 'GET' && pathname.startsWith('/packages/')) {
            const id = decodeURIComponent(pathname.slice('/packages/'.length));
            if (!isValidId(id)) throw new HttpError(400, `Invalid package ID: ${id}`);
            const pkg = await registry.get(id);
            if (!pkg) throw new HttpError(404, `Package not found: ${id}`);
            res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': pkg.bytes.length });
            res.end(pkg.bytes);
            return;
        }

        if (method === 'POST' && pathname === '/packages') {
            const body = await readJson(req, maxBodyBytes);
            const packages = stringArray(body.packages, 'packages').map((b64) =>
                Package.decode(Buffer.from(b64, 'base64')),
            );
            const providers = stringArray(body.providers, 'providers').map(providerUrl);
            if (providers.length > 0 && !allowProviders)
                throw new HttpError(400, 'This server does not fetch from provider registries');
            if (providers.length > maxProviders)
                throw new HttpError(400, `At most ${maxProviders} provider registries are accepted`);

            const stored = await ingest(registry, packages, {
                sources: providers.map((url) => new RemoteRegistry(url)),
                verify,
            });
            return send(res, 200, { ids: packages.map((p) => p.id), stored: stored.map((p) => p.id) });
        }

        throw new HttpError(404, `No route for ${method} ${pathname}`);
    }

    return (req, res) => {
        route(req, res).catch((e: unknown) => {
            const status = statusFor(e);
            const message = e instanceof HttpError || e instanceof DpmError ? e.message : 'Internal server error';
            if (status === 500) console.error(e);
            if (!res.headersSent) send(res, status, { error: message });
            else res.destroy();
        });
    };
}

/** Creates (but does not start) an HTTP server for a DPM registry. */
export function createServer(options: ServerOptions): http.Server {
    return http.createServer(createHandler(options));
}
