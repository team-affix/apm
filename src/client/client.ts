import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    DpmError,
    fetchTree,
    Graph,
    install,
    Kubo,
    PinningService,
    PinStatus,
    readManifest,
    readPackageFolder,
} from '../core';
import { Remote } from './config';

/**
 * Writes the package a project folder makes (everything except `deps/` and hidden files) to a new folder, `out`
 * or else a fresh temporary one, and returns that folder and the CID it will have once added to IPFS. `out` must
 * not exist yet. Nothing is stored in IPFS: add it with `ipfs add -r <folder>`.
 */
export async function pack(dir: string, kubo: Kubo, out?: string): Promise<{ folder: string; cid: string }> {
    readManifest(dir);
    const entries = readPackageFolder(dir);
    let folder: string;
    if (out) {
        folder = path.resolve(out);
        if (fs.existsSync(folder)) throw new DpmError(`${folder} already exists: pack writes a new folder`);
        fs.mkdirSync(path.dirname(folder), { recursive: true });
    } else folder = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dpm-pack-')), 'package');
    fs.mkdirSync(folder);
    for (const e of entries) {
        const target = path.join(folder, ...e.path.split('/'));
        if (e.dir) fs.mkdirSync(target, { recursive: true });
        else fs.writeFileSync(target, e.content);
    }
    return { folder, cid: await kubo.addFolder(entries, false) };
}

/** A project's CID, computed without storing anything. */
export function cidOf(dir: string, kubo: Kubo): Promise<string> {
    readManifest(dir);
    return kubo.addFolder(readPackageFolder(dir), false);
}

/**
 * A package and every package it depends on, recursively, each once: the package first. For example, to pin a
 * whole tree: `dpm tree <cid> | xargs -n1 ipfs pin add`.
 */
export async function tree(cid: string, kubo: Kubo): Promise<string[]> {
    return Object.keys((await fetchTree(kubo, [cid])).packages);
}

/**
 * A remote DPM server's view of its node, in Kubo's own RPC format: the same calls as for the local node,
 * answering only for the server's DPM packages.
 */
export const remoteNode = (r: Remote) => new Kubo(r.url, '20s');

/**
 * Installs a project's dependencies (see core `install`). Before fetching each package, asks the remotes
 * whether they keep it (dependencies included) and connects to those that do, so fetching doesn't depend on
 * finding it in the wider network.
 */
export function installProject(dir: string, kubo: Kubo, remotes: readonly Remote[]): Promise<Graph> {
    const connected = new Set<string>();
    return install(dir, kubo, {
        before: async (cid) => {
            for (const remote of remotes) {
                const node = remoteNode(remote);
                if (!(await node.isPinned(cid))) continue;
                const addresses = await node
                    .id()
                    .then((n) => n.addresses)
                    .catch(() => []);
                for (const a of addresses) {
                    if (connected.has(a)) continue;
                    connected.add(a);
                    await kubo.connect(a).catch(() => undefined);
                }
            }
        },
    });
}

/**
 * What each remote decided about a CID: its latest pin request for it, with the reason if it refused. Read-only.
 * (`ipfs pin remote add` reports a refusal, but not the server's reason.)
 */
export async function status(
    cid: string,
    remotes: readonly Remote[],
): Promise<{ remote: string; status?: PinStatus }[]> {
    const out: { remote: string; status?: PinStatus }[] = [];
    for (const r of remotes) {
        const found = await new PinningService(r.url).list({
            cid: [cid],
            status: ['queued', 'pinning', 'pinned', 'failed'],
        });
        out.push({ remote: r.name, ...(found[0] && { status: found[0] }) });
    }
    return out;
}
