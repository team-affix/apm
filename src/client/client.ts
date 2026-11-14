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
    status: PinStatus;
}

/**
 * Asks remotes to keep a package. Nothing is uploaded: each remote's node fetches the package and its
 * dependencies from ours over IPFS. Our node first makes sure it holds the whole tree, then connects out to
 * each remote's node, so the remote can fetch over that connection even if ours can't be reached from outside.
 */
export async function push(
    cid: string,
    remotes: readonly Remote[],
    kubo: Kubo,
    timeoutMs = 120_000,
): Promise<PushResult[]> {
    await fetchTree(kubo, [cid]);
    const origins = (await kubo.id()).addresses;
    const results: PushResult[] = [];
    for (const remote of remotes) {
        const s = service(remote);
        const requested = await s.add({ cid, origins });
        for (const d of requested.delegates) await kubo.connect(d).catch(() => undefined);
        results.push({ remote: remote.name, status: await s.wait(requested.requestid, timeoutMs) });
    }
    return results;
}

/**
 * Installs a project's dependencies (see core `install`). Before fetching each package, asks the remotes
 * whether they keep it, and connects to those that do, so fetching doesn't depend on finding it in the wider
 * network.
 */
export function installProject(dir: string, kubo: Kubo, remotes: readonly Remote[]): Promise<Graph> {
    const connected = new Set<string>();
    return install(dir, kubo, {
        before: async (cid) => {
            for (const remote of remotes) {
                const found = await service(remote)
                    .list({ cid: [cid], status: ['pinned'], limit: 1 })
                    .catch(() => []);
                for (const d of found[0]?.delegates ?? []) {
                    if (connected.has(d)) continue;
                    connected.add(d);
                    await kubo.connect(d).catch(() => undefined);
                }
            }
        },
    });
}
