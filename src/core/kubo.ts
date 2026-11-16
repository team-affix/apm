import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import tar from 'tar-stream';
import { KuboError } from './errors';

/** The Authorization header for a secret written as Kubo writes them: `bearer:<token>` or `basic:<user>:<password>`. */
export function authorizationHeader(secret: string): string {
    const i = secret.indexOf(':');
    const scheme = secret.slice(0, i).toLowerCase();
    const value = secret.slice(i + 1);
    if (i > 0 && value && scheme === 'bearer') return `Bearer ${value}`;
    if (i > 0 && value.includes(':') && scheme === 'basic') return `Basic ${Buffer.from(value).toString('base64')}`;
    throw new KuboError("An IPFS API secret must be 'bearer:<token>' or 'basic:<user>:<password>'");
}

/**
 * A read-only client for a Kubo node's HTTP API (which Kubo calls its RPC API; normally http://127.0.0.1:5001):
 * everything `dpm` needs, and nothing that changes the node. It sends four requests: `cat`, `refs`, `get` and
 * `version` (see docs/ipfs.md). The node may be on this machine or another: it's only a URL. A node reachable
 * from other machines should require a secret limited to those requests (Kubo's `API.Authorizations`).
 *
 * It is meant to be extended: `call` and `json` are protected, so a program that does need other requests (e.g. a
 * server pinning what it accepts) can add them in a subclass of its own.
 */
export class Kubo {
    private readonly authorization?: string;

    constructor(
        public readonly api = process.env.DPM_KUBO_API ?? 'http://127.0.0.1:5001',
        /** How long a request that may have to search the network can take, e.g. '60s'. */
        public readonly timeout = '120s',
        /**
         * The secret for a node that requires one, written as in Kubo's `API.Authorizations` and its `--api-auth`
         * option: `bearer:<token>` or `basic:<user>:<password>`.
         */
        auth?: string,
    ) {
        if (auth) this.authorization = authorizationHeader(auth);
    }

    protected async call(
        command: string,
        params: Record<string, string | string[]> = {},
        body?: Buffer,
        type?: string,
    ) {
        const url = new URL(`/api/v0/${command}`, this.api);
        for (const [k, v] of Object.entries(params))
            for (const value of Array.isArray(v) ? v : [v]) url.searchParams.append(k, value);
        let res: Response;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: {
                    ...(body && { 'content-type': type ?? 'application/octet-stream' }),
                    ...(this.authorization && { authorization: this.authorization }),
                },
                ...(body && { body }),
            });
        } catch (e) {
            throw new KuboError(
                `Cannot reach the IPFS node at ${this.api} (${(e as Error).message}). Is Kubo running ('ipfs daemon')?`,
            );
        }
        if (!res.ok) {
            const text = await res.text();
            let message = text;
            try {
                message = (JSON.parse(text) as { Message?: string }).Message ?? text;
            } catch {
                // not JSON: keep the text
            }
            throw new KuboError(`IPFS ${command} failed: ${message.trim()}`);
        }
        return res;
    }

    protected async json<T>(command: string, params: Record<string, string | string[]> = {}): Promise<T> {
        return (await (await this.call(command, params)).json()) as T;
    }

    async version(): Promise<string> {
        return (await this.json<{ Version: string }>('version')).Version;
    }

    /** A file's bytes, by path: `<cid>/dpm.json`. Fetches from the network if needed. */
    async cat(ipfsPath: string): Promise<Buffer> {
        const res = await this.call('cat', { arg: ipfsPath, timeout: this.timeout });
        return Buffer.from(await res.arrayBuffer());
    }

    /**
     * Fetches a CID and everything under it without pinning it: it is stored like any fetched data, until the
     * node's garbage collection (if any) removes it.
     */
    async fetch(cid: string): Promise<void> {
        const res = await this.call('refs', { arg: cid, recursive: 'true', unique: 'true', timeout: this.timeout });
        // refs streams one JSON object per line, and reports failures inside the stream ({ "Err": ... }) or in
        // the X-Stream-Error trailer, with HTTP 200.
        const text = await res.text();
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            const err = (JSON.parse(line) as { Err?: string; Message?: string }).Err;
            if (err) throw new KuboError(`IPFS refs failed: ${err}`);
        }
        const trailer = res.headers.get('x-stream-error');
        if (trailer) throw new KuboError(`IPFS refs failed: ${trailer}`);
    }

    /** Writes the folder `cid` (which must be available) to `dest`, which must not exist yet. */
    async exportTo(cid: string, dest: string): Promise<void> {
        const res = await this.call('get', { arg: cid, timeout: this.timeout });
        if (!res.body) throw new KuboError(`IPFS get returned nothing for ${cid}`);
        const tmp = `${dest}.partial-${process.pid}`;
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp, { recursive: true });
        const extract = tar.extract();
        extract.on('entry', (header, stream, next) => {
            // Entries are '<cid>/<path>'. Anything that would land outside the folder is refused.
            const rel = header.name.split('/').slice(1).join('/');
            const target = path.resolve(tmp, rel);
            if (rel && !target.startsWith(path.resolve(tmp) + path.sep)) {
                stream.resume();
                next(new KuboError(`IPFS get returned an unsafe path: ${header.name}`));
                return;
            }
            if (header.type === 'directory') {
                fs.mkdirSync(target, { recursive: true });
                stream.resume();
                stream.on('end', next);
            } else if (header.type === 'file') {
                fs.mkdirSync(path.dirname(target), { recursive: true });
                const out = fs.createWriteStream(target);
                stream.pipe(out);
                out.on('finish', next);
                out.on('error', next);
            } else {
                // Symlinks and anything else are not part of DPM packages.
                stream.resume();
                stream.on('end', next);
            }
        });
        await pipeline(Readable.fromWeb(res.body as never), extract);
        fs.renameSync(tmp, dest);
    }
}
