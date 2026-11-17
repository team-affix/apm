import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import tar from 'tar-stream';
import { KuboError } from './errors';
import { Entry } from './folder';

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
 * How DPM adds packages, sent with every add: Kubo's `unixfs-v1-2025` settings (CIDv1, raw leaves, 1 MiB chunks,
 * SHA-256). A CID depends on how files are split into blocks, so with these fixed, the same files get the same
 * CID on every node, however that node is configured.
 */
export const IMPORT_SETTINGS = {
    'cid-version': '1',
    'raw-leaves': 'true',
    chunker: 'size-1048576',
    hash: 'sha2-256',
    'max-file-links': '1024',
    'max-hamt-fanout': '256',
} as const;

/**
 * A client for a Kubo node's HTTP API (which Kubo calls its RPC API; normally http://127.0.0.1:5001): everything
 * `dpm` needs. It sends five requests: `add` (for `dpm pack`), and the read-only `cat`, `refs`, `get` and
 * `version` (see docs/ipfs.md). The node may be on this machine or another: it's only a URL.
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

    /**
     * Adds a package's files as one folder, with DPM's fixed import settings, and returns the folder's CID. Kubo
     * pins what it adds, as `ipfs add` does.
     */
    async addFolder(entries: readonly Entry[]): Promise<string> {
        const boundary = `dpm-${Math.random().toString(36).slice(2)}`;
        // The folder's own name doesn't affect its CID; only the names of what is inside it do.
        const root = 'package';
        const parts: Buffer[] = [];
        const part = (name: string, type: string, content: Buffer) => {
            parts.push(
                Buffer.from(
                    `--${boundary}\r\n` +
                        `Content-Disposition: form-data; name="file"; filename="${encodeURIComponent(name)}"\r\n` +
                        `Content-Type: ${type}\r\n\r\n`,
                ),
                content,
                Buffer.from('\r\n'),
            );
        };
        part(root, 'application/x-directory', Buffer.alloc(0));
        for (const e of entries)
            if (e.dir) part(`${root}/${e.path}`, 'application/x-directory', Buffer.alloc(0));
            else part(`${root}/${e.path}`, 'application/octet-stream', e.content);
        parts.push(Buffer.from(`--${boundary}--\r\n`));

        const res = await this.call(
            'add',
            { ...IMPORT_SETTINGS, progress: 'false', quieter: 'false' },
            Buffer.concat(parts),
            `multipart/form-data; boundary=${boundary}`,
        );
        const lines = (await res.text())
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l) as { Name: string; Hash: string });
        const top = lines.find((l) => l.Name === root);
        if (!top) throw new KuboError('IPFS add did not report the folder it added');
        return top.Hash;
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
