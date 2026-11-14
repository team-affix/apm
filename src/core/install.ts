import fs from 'fs';
import path from 'path';
import { KuboError, ManifestError } from './errors';
import { Kubo } from './kubo';
import { isCid, MANIFEST, parseManifest, readManifest } from './manifest';

/** Who depends on whom, as installed: written to `deps/graph.json`. */
export interface Graph {
    /** The project's own direct dependencies. */
    readonly root: readonly string[];
    /** Every installed package (each once, however many depend on it), with its direct dependencies. */
    readonly packages: Readonly<Record<string, { readonly deps: readonly string[] }>>;
}

export const DEPS = 'deps';
export const GRAPH = 'graph.json';

/** The dependencies of a package already fetched: its dpm.json, or none. */
export async function depsOf(kubo: Kubo, cid: string): Promise<readonly string[]> {
    let text: string;
    try {
        text = (await kubo.cat(`${cid}/${MANIFEST}`)).toString('utf8');
    } catch (e) {
        // A package without dpm.json has no dependencies.
        if (e instanceof KuboError && /no link named|not found|does not exist/i.test(e.message)) return [];
        throw e;
    }
    return parseManifest(text, `${MANIFEST} of ${cid}`).deps;
}

export interface FetchOptions {
    /** Called before fetching each CID: e.g. to connect to nodes known to have it. */
    readonly before?: (cid: string) => Promise<void>;
    /** Called after each CID is fetched. */
    readonly fetched?: (cid: string) => void;
}

/**
 * Fetches every package reachable from `roots`, following each package's dpm.json, and returns the graph. Each
 * package is fetched once, however many depend on it. Kubo checks every block against its CID.
 *
 * Nothing is pinned: whoever calls this pins what it has decided to keep, once it has decided (see
 * docs/engineering.md).
 */
export async function fetchTree(kubo: Kubo, roots: readonly string[], opts: FetchOptions = {}): Promise<Graph> {
    const packages: Record<string, { deps: readonly string[] }> = {};
    const queue = [...roots];
    for (let cid = queue.shift(); cid !== undefined; cid = queue.shift()) {
        if (packages[cid]) continue;
        if (!isCid(cid)) throw new ManifestError(`Not a CID: '${cid}'`);
        await opts.before?.(cid);
        try {
            await kubo.fetch(cid);
        } catch (e) {
            throw new KuboError(`Could not fetch ${cid}: ${(e as Error).message}`);
        }
        opts.fetched?.(cid);
        const deps = await depsOf(kubo, cid);
        packages[cid] = { deps };
        queue.push(...deps);
    }
    return { root: [...roots], packages };
}

export interface InstallOptions extends FetchOptions {
    /**
     * Pin the installed packages, so the node keeps them (default: true). Pinning happens only once the whole
     * tree has been fetched. A server checking a package installs it with false: it pins only what passes.
     */
    readonly pin?: boolean;
}

/**
 * Installs a project's dependencies: fetches the whole tree, pins it once all of it has arrived, writes each
 * package to `deps/<cid>/` (flat: however deep it is in the tree), removes packages no longer needed, and writes
 * `deps/graph.json`.
 *
 * DPM gives every package its own folder, named by CID, so two packages never collide on disk and the same
 * package is installed once. What packages mean, and what to do if two of them clash, is up to the tools that
 * use them.
 */
export async function install(dir: string, kubo: Kubo, opts: InstallOptions = {}): Promise<Graph> {
    const graph = await fetchTree(kubo, readManifest(dir).deps, opts);
    if (opts.pin !== false) for (const cid of Object.keys(graph.packages)) await kubo.pin(cid);
    const deps = path.join(dir, DEPS);
    fs.mkdirSync(deps, { recursive: true });
    for (const cid of Object.keys(graph.packages)) {
        const dest = path.join(deps, cid);
        // Content never changes under a CID, so an existing folder is kept.
        if (!fs.existsSync(dest)) await kubo.exportTo(cid, dest);
    }
    for (const name of fs.readdirSync(deps))
        if (isCid(name) && !graph.packages[name]) fs.rmSync(path.join(deps, name), { recursive: true, force: true });
    fs.writeFileSync(path.join(deps, GRAPH), JSON.stringify(graph, null, 4) + '\n');
    return graph;
}

/** The installed graph, if any. */
export function readGraph(dir: string): Graph | undefined {
    const file = path.join(dir, DEPS, GRAPH);
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Graph) : undefined;
}
