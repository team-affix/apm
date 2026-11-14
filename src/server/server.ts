import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fetchTree, Graph, install, isCid, Kubo, Pin, PIN_NAME, PinState, PinStatus } from '../core';

/**
 * A DPM server: the IPFS Pinning Service API in front of a Kubo node, plus a policy deciding what to keep.
 *
 * A client asks it to pin a CID and says where to fetch it (`origins`). The server's Kubo fetches the package
 * and everything it depends on over IPFS (hash-checked block by block), then the policy decides: keep it, or
 * report it failed and let it go. Content never travels over this API.
 *
 * The Kubo node's RPC API is the server's private admin interface; only this server talks to it. Peers reach
 * the node through its own peer-to-peer port.
 */

/** Decides whether to keep a package, once it and its dependencies are fetched. Returns a reason to refuse it. */
export type Policy = (pkg: { cid: string; graph: Graph; kubo: Kubo }) => Promise<string | undefined>;

export interface ServerOptions {
    kubo: Kubo;
    /** Where pin requests are stored. */
    dataDir: string;
    /** If set, adding or removing pins needs `Authorization: Bearer <one of these>`. Reading is open. */
    tokens?: readonly string[];
    /** Multiaddrs clients should connect to (default: the Kubo node's own addresses). */
    delegates?: readonly string[];
    policy?: Policy;
    /**
     * Keep each package's dependencies too, so everything listed can be installed from this server alone
     * (default: false). Either way, dependencies are fetched to apply the policy; by default they are then let
     * go, and a dependency is kept only if it was pushed itself (`dpm push --with-deps` pushes a whole tree).
     */
    keepDependencies?: boolean;
}

/** A pin request as stored: its public status, and the CIDs it holds once pinned (it, and its dependencies if kept). */
interface Request extends PinStatus {
    tree?: string[];
}

/**
 * A policy that runs a command in the installed package (`deps/` filled in) and accepts the package if the
 * command succeeds. A Unilog server uses `unilog check`. The command's output is the reason for a refusal.
 */
export function commandPolicy(command: string): Policy {
    return async ({ cid, kubo }) => {
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dpm-check-'));
        try {
            const dir = path.join(work, 'package');
            await kubo.exportTo(cid, dir);
            await install(dir, kubo);
            const { code, output } = await new Promise<{ code: number | null; output: string }>((resolve) => {
                const child = spawn(command, { cwd: dir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
                let output = '';
                child.stdout.on('data', (d: Buffer) => (output += d.toString()));
                child.stderr.on('data', (d: Buffer) => (output += d.toString()));
                child.on('close', (c) => resolve({ code: c, output }));
                child.on('error', (e) => resolve({ code: -1, output: e.message }));
            });
            return code === 0 ? undefined : `'${command}' failed: ${output.trim().slice(-2000) || `exit code ${code}`}`;
        } finally {
            fs.rmSync(work, { recursive: true, force: true });
        }
    };
}

export interface DpmServer {
    readonly http: http.Server;
    /** Resolves once every request queued so far has been processed (for tests and shutdown). */
    idle(): Promise<void>;
}

export async function createServer(opts: ServerOptions): Promise<DpmServer> {
    const { kubo } = opts;
    const delegates = [...(opts.delegates ?? (await kubo.id()).addresses)];
    fs.mkdirSync(opts.dataDir, { recursive: true });
    const file = path.join(opts.dataDir, 'requests.json');
    const requests: Request[] = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Request[]) : [];
    const save = () => fs.writeFileSync(file, JSON.stringify(requests, null, 2));
    const publicStatus = (r: Request): PinStatus => {
        const { tree, ...status } = r;
        void tree; // internal: which CIDs this request holds
        return { ...status, delegates };
    };

    // One task at a time, in order: processing requests, and collecting garbage (which must not run while a
    // request is fetching). Requests interrupted by a restart are picked up again.
    let queue = Promise.resolve();
    const run = (task: () => Promise<void>) => {
        queue = queue.then(task).catch(() => undefined);
    };
    const enqueue = (r: Request) => run(() => processRequest(r));
    /** Deletes whatever the node no longer pins, so it stops serving packages it refused or released. */
    const collect = () => run(() => kubo.gc());
    for (const r of requests) if (r.status === 'queued' || r.status === 'pinning') enqueue(r);

    /** CIDs kept for pinned requests, other than `except`. */
    const held = (except?: Request) =>
        new Set(requests.filter((r) => r !== except && r.status === 'pinned').flatMap((r) => r.tree ?? []));

    /** Unpins whatever of `cids` no pinned request still holds. Pins DPM didn't create are left alone. */
    async function release(cids: readonly string[], except?: Request) {
        const keep = held(except);
        const ours = new Set(await kubo.packages());
        for (const cid of cids) if (!keep.has(cid) && ours.has(cid)) await kubo.unpin(cid).catch(() => undefined);
    }

    async function processRequest(r: Request) {
        r.status = 'pinning';
        save();
        let fetched: string[] = [];
        try {
            // Connect to where the client said the content is. Failures are fine: the client also connects to us.
            for (const origin of r.pin.origins ?? []) await kubo.connect(origin).catch(() => undefined);
            const graph = await fetchTree(kubo, [r.pin.cid], { fetched: (cid) => fetched.push(cid) });
            fetched = Object.keys(graph.packages);
            const refusal = opts.policy ? await opts.policy({ cid: r.pin.cid, graph, kubo }) : undefined;
            if (refusal) throw new Error(refusal);
            r.status = 'pinned';
            r.tree = opts.keepDependencies ? fetched : [r.pin.cid];
            r.info = {};
            // Dependencies were fetched only to apply the policy: let go of those no request holds.
            const extra = fetched.filter((cid) => !r.tree?.includes(cid));
            if (extra.length) {
                await release(extra);
                collect();
            }
        } catch (e) {
            r.status = 'failed';
            r.info = { reason: (e as Error).message };
            await release(fetched, r);
            collect();
        }
        save();
    }

    const send = (res: http.ServerResponse, status: number, body?: unknown) => {
        res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
        res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const fail = (res: http.ServerResponse, status: number, reason: string, details?: string) =>
        send(res, status, { error: { reason, ...(details && { details }) } });
    const authorized = (req: http.IncomingMessage) => {
        if (!opts.tokens?.length) return true;
        const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
        return !!m && opts.tokens.includes(m[1] as string);
    };
    const readBody = (req: http.IncomingMessage) =>
        new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (c: Buffer) => {
                data += c.toString();
                if (data.length > 1_000_000) reject(new Error('too large'));
            });
            req.on('end', () => resolve(data));
            req.on('error', reject);
        });

    /**
     * A read-only view of the node in Kubo's own RPC format, so clients ask a server exactly what they ask
     * their local node: `pin/ls` (only DPM's packages: the pins named `dpm`), `id` (the node's public
     * addresses) and `version` (which the `ipfs` command checks first). Nothing else is answered, and nothing is
     * passed through to the node's real RPC API, which stays private.
     */
    async function kuboView(url: URL, res: http.ServerResponse) {
        const kuboError = (message: string) => send(res, 500, { Message: message, Code: 0, Type: 'error' });
        const command = url.pathname.slice('/api/v0/'.length);
        if (command === 'version') return send(res, 200, await kubo.versionInfo());
        if (command === 'id') {
            const node = await kubo.id();
            return send(res, 200, { ID: node.id, Addresses: delegates });
        }
        if (command === 'pin/ls') {
            const type = url.searchParams.get('type') ?? 'all';
            if (!['all', 'recursive'].includes(type)) return send(res, 200, { Keys: {} });
            const packages = new Set(await kubo.packages());
            const asked = url.searchParams.getAll('arg');
            for (const cid of asked) if (!packages.has(cid)) return kuboError(`path '${cid}' is not pinned`);
            const keys = asked.length ? asked : [...packages];
            return send(res, 200, {
                Keys: Object.fromEntries(keys.map((cid) => [cid, { Type: 'recursive', Name: PIN_NAME }])),
            });
        }
        return send(res, 404, { Message: `${command}: not available on a DPM server`, Code: 0, Type: 'error' });
    }

    const server = http.createServer((req, res) => {
        void (async () => {
            const url = new URL(req.url ?? '/', 'http://dpm');
            const parts = url.pathname.split('/').filter(Boolean);
            try {
                if (url.pathname.startsWith('/api/v0/')) return await kuboView(url, res);
                if (parts[0] !== 'pins' || parts.length > 2) return fail(res, 404, 'NOT_FOUND');

                if (parts.length === 1 && req.method === 'GET') {
                    const cids = url.searchParams.get('cid')?.split(',').filter(Boolean);
                    const states = (url.searchParams.get('status') ?? 'pinned').split(',') as PinState[];
                    const limit = Math.min(Number(url.searchParams.get('limit') ?? 10) || 10, 1000);
                    const matching = requests
                        .filter((r) => states.includes(r.status) && (!cids || cids.includes(r.pin.cid)))
                        .reverse();
                    return send(res, 200, {
                        count: matching.length,
                        results: matching.slice(0, limit).map(publicStatus),
                    });
                }

                if (parts.length === 1 && req.method === 'POST') {
                    if (!authorized(req)) return fail(res, 401, 'UNAUTHORIZED', 'A valid access token is required');
                    let pin: Pin;
                    try {
                        pin = JSON.parse(await readBody(req)) as Pin;
                    } catch {
                        return fail(res, 400, 'BAD_REQUEST', 'The body must be a JSON object: { "cid": ... }');
                    }
                    if (typeof pin?.cid !== 'string' || !isCid(pin.cid))
                        return fail(res, 400, 'BAD_REQUEST', `Not a CID: ${JSON.stringify(pin?.cid)}`);
                    const r: Request = {
                        requestid: crypto.randomUUID(),
                        status: 'queued',
                        created: new Date().toISOString(),
                        pin: {
                            cid: pin.cid,
                            ...(typeof pin.name === 'string' && { name: pin.name }),
                            ...(Array.isArray(pin.origins) && {
                                origins: pin.origins.filter((o) => typeof o === 'string'),
                            }),
                        },
                        delegates,
                        info: {},
                    };
                    requests.push(r);
                    save();
                    enqueue(r);
                    return send(res, 202, publicStatus(r));
                }

                const r = requests.find((x) => x.requestid === parts[1]);
                if (!r) return fail(res, 404, 'NOT_FOUND', `No pin request ${parts[1]}`);
                if (req.method === 'GET') return send(res, 200, publicStatus(r));
                if (req.method === 'DELETE') {
                    if (!authorized(req)) return fail(res, 401, 'UNAUTHORIZED', 'A valid access token is required');
                    requests.splice(requests.indexOf(r), 1);
                    save();
                    if (r.status === 'pinned') {
                        await release(r.tree ?? []);
                        collect();
                    }
                    return send(res, 202);
                }
                return fail(res, 404, 'NOT_FOUND');
            } catch (e) {
                return fail(res, 500, 'INTERNAL_SERVER_ERROR', (e as Error).message);
            }
        })();
    });

    return { http: server, idle: () => queue };
}
