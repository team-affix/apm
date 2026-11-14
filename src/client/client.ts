import { fetchTree, Graph, install, Kubo, PinStatus, readPackageFolder } from '../core';
import { Remote, service } from './config';

/** Adds a project folder to the local Kubo node (leaving out `deps/` and hidden files) and returns its CID. */
export function pack(dir: string, kubo: Kubo): Promise<string> {
    return kubo.addFolder(readPackageFolder(dir));
}

/** A package's CID, computed without storing anything. */
export function cidOf(dir: string, kubo: Kubo): Promise<string> {
    return kubo.addFolder(readPackageFolder(dir), false);
}

export interface PushResult {
    remote: string;
    cid: string;
    status: PinStatus;
}

/**
 * Asks remotes to keep a package (with `withDeps`, also each package it depends on, each as its own request).
 * Nothing is uploaded: each remote's node fetches the content from ours over IPFS. Our node first makes sure it
 * holds the whole tree, then connects out to each remote's node, so the remote can fetch over that connection
 * even if ours can't be reached from outside.
 */
export async function push(
    cid: string,
    remotes: readonly Remote[],
    kubo: Kubo,
    timeoutMs = 120_000,
    withDeps = false,
): Promise<PushResult[]> {
    const graph = await fetchTree(kubo, [cid]);
    // Dependencies first, the package itself last.
    const cids = withDeps ? [...Object.keys(graph.packages).filter((c) => c !== cid), cid] : [cid];
    const origins = (await kubo.id()).addresses;
    const results: PushResult[] = [];
    for (const remote of remotes) {
        const s = service(remote);
        for (const c of cids) {
            const requested = await s.add({ cid: c, origins });
            for (const d of requested.delegates) await kubo.connect(d).catch(() => undefined);
            results.push({ remote: remote.name, cid: c, status: await s.wait(requested.requestid, timeoutMs) });
        }
    }
    return results;
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
 * Pins packages and their whole trees (every package their dpm.json files name, recursively), so the node keeps
 * them. Plain `ipfs pin add` would pin only each package's own folder, not the packages it depends on.
 *
 * The whole tree is fetched first, and pinned only if all of it arrived: a tree that can't be completed is not
 * partly pinned. Pinning is a separate step from `install` on purpose: install, check (e.g. `unilog check`),
 * then decide to keep.
 */
export async function pinTree(cids: readonly string[], kubo: Kubo): Promise<string[]> {
    const graph = await fetchTree(kubo, cids);
    const all = Object.keys(graph.packages);
    for (const cid of all) await kubo.pin(cid);
    return all;
}
