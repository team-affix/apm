import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import tar from 'tar-stream';
import { KuboError } from './errors';

/**
 * How DPM adds content to IPFS. A CID depends on how files are chunked and encoded, so these are fixed: the
 * same folder always gets the same CID, on every machine. (Kubo's `unixfs-v1-2025` profile: CIDv1, raw
 * leaves, 1 MiB chunks, SHA-256.)
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
 * The name DPM gives its pins, so a node shared with other applications can tell DPM's packages apart.
 * A CID has one pin, and pinning again with another name renames it, so DPM only names pins it creates.
 */
export const PIN_NAME = 'dpm';

/** A file or folder to add, by its path inside the package ('/'-separated). */
export type Entry = { path: string; dir: true } | { path: string; dir?: false; content: Buffer };

/** The parts of a node's identity peers need: its peer ID and the addresses it can be reached at. */
export interface NodeInfo {
    id: string;
    addresses: string[];
}

/**
 * A client for a Kubo node's RPC API (normally http://127.0.0.1:5001). That API is the node's admin interface,
 * so it must stay private; peers reach the node through its own peer-to-peer port instead.
 */
export class Kubo {
    constructor(
        public readonly api = process.env.DPM_KUBO_API ?? 'http://127.0.0.1:5001',
        /** How long a request that may have to search the network can take, e.g. '60s'. */
        public readonly timeout = '120s',
    ) {}

    private async call(command: string, params: Record<string, string | string[]> = {}, body?: Buffer, type?: string) {
        const url = new URL(`/api/v0/${command}`, this.api);
        for (const [k, v] of Object.entries(params))
            for (const value of Array.isArray(v) ? v : [v]) url.searchParams.append(k, value);
        let res: Response;
        try {
            res = await fetch(url, {
                method: 'POST',
                ...(body && { body, headers: { 'content-type': type ?? 'application/octet-stream' } }),
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

    private async json<T>(command: string, params: Record<string, string | string[]> = {}): Promise<T> {
        return (await (await this.call(command, params)).json()) as T;
    }

    async version(): Promise<string> {
        return (await this.versionInfo()).Version;
    }

    /** The node's version report, as Kubo gives it (the `ipfs` command checks it before anything else). */
    versionInfo(): Promise<{ Version: string } & Record<string, unknown>> {
        return this.json('version');
    }

    async id(): Promise<NodeInfo> {
        const r = await this.json<{ ID: string; Addresses: string[] | null }>('id');
        return { id: r.ID, addresses: r.Addresses ?? [] };
    }

    /**
     * Adds a folder, with DPM's fixed import settings, and returns its CID. `pin`: keep it (otherwise only
     * compute the CID, storing nothing).
     */
    async addFolder(entries: readonly Entry[], pin = true): Promise<string> {
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
            {
                ...IMPORT_SETTINGS,
                pin: String(pin),
                ...(pin && { 'pin-name': PIN_NAME }),
                'only-hash': String(!pin),
                progress: 'false',
                quieter: 'false',
            },
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

    /** Whether a path exists, without fetching anything from the network. */
    async hasLocally(ipfsPath: string): Promise<boolean> {
        try {
            await this.call('files/stat', { arg: `/ipfs/${ipfsPath}`, offline: 'true', timeout: '10s' });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Fetches a CID and everything under it, and keeps it, named as DPM's. If it is already pinned (perhaps by
     * another application), it is left as it is.
     */
    async pin(cid: string): Promise<void> {
        if (await this.isPinned(cid)) return;
        await this.call('pin/add', {
            arg: cid,
            recursive: 'true',
            name: PIN_NAME,
            progress: 'false',
            timeout: this.timeout,
        });
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

    /** Whether a CID is pinned recursively, by anyone. */
    async isPinned(cid: string): Promise<boolean> {
        try {
            await this.call('pin/ls', { arg: cid, type: 'recursive' });
            return true;
        } catch {
            return false;
        }
    }

    async unpin(cid: string): Promise<void> {
        await this.call('pin/rm', { arg: cid, recursive: 'true' });
    }

    /** The CIDs pinned recursively on this node, by anyone. */
    async pins(): Promise<string[]> {
        const r = await this.json<{ Keys?: Record<string, unknown> }>('pin/ls', { type: 'recursive' });
        return Object.keys(r.Keys ?? {});
    }

    /** The CIDs DPM pinned on this node: its packages, as opposed to other applications' content. */
    async packages(): Promise<string[]> {
        const r = await this.json<{ Keys?: Record<string, { Name?: string }> }>('pin/ls', {
            type: 'recursive',
            names: 'true',
        });
        return Object.entries(r.Keys ?? {})
            .filter(([, v]) => v.Name === PIN_NAME)
            .map(([cid]) => cid);
    }

    /**
     * Deletes everything not pinned. A DPM server runs this after refusing or releasing a package, so its node
     * stops serving what it refused.
     */
    async gc(): Promise<void> {
        await this.call('repo/gc', { silent: 'true' });
    }

    /** Connects to another node, by a multiaddr that includes its peer ID (`.../p2p/<id>`). */
    async connect(multiaddr: string): Promise<void> {
        await this.call('swarm/connect', { arg: multiaddr, timeout: '15s' });
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

/** Every file and folder in a package directory, for `addFolder`. Hidden entries and `deps/` are left out. */
export function readPackageFolder(dir: string, exclude: readonly string[] = ['deps']): Entry[] {
    const out: Entry[] = [];
    const walk = (rel: string) => {
        const abs = path.join(dir, rel);
        for (const name of fs.readdirSync(abs).sort()) {
            if (name.startsWith('.')) continue;
            const relPath = rel ? `${rel}/${name}` : name;
            if (!rel && exclude.includes(name)) continue;
            const stat = fs.lstatSync(path.join(abs, name));
            if (stat.isDirectory()) {
                out.push({ path: relPath, dir: true });
                walk(relPath);
            } else if (stat.isFile()) out.push({ path: relPath, content: fs.readFileSync(path.join(abs, name)) });
        }
    };
    walk('');
    return out;
}
