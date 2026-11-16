import fs from 'fs';
import path from 'path';
import { KuboError, ManifestError } from './errors';
import { Kubo } from './kubo';
import { isCid, MANIFEST, parseManifest, readManifest } from './manifest';

/** A dependency tree: who depends on whom. */
export interface Graph {
    /** The project's own direct dependencies. */
    readonly root: readonly string[];
    /** Every installed package (each once, however many depend on it), with its direct dependencies. */
    readonly packages: Readonly<Record<string, { readonly deps: readonly string[] }>>;
}

export const DEPS = 'deps';

/** The dependencies of a package already fetched, from its dpm.json. Without one, it isn't a DPM package. */
export async function depsOf(kubo: Kubo, cid: string): Promise<readonly string[]> {
    let text: string;
    try {
        text = (await kubo.cat(`${cid}/${MANIFEST}`)).toString('utf8');
    } catch (e) {
        if (e instanceof KuboError && /no link named|not found|does not exist/i.test(e.message))
            throw new ManifestError(`${cid} is not a DPM package: it has no ${MANIFEST}`);
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

/**
 * Installs a project's dependencies: fetches the whole tree, writes each package to `deps/<cid>/` (flat: however
 * deep it is in the tree), and removes packages no longer needed. Returns the tree it installed. Each package's
 * folder keeps its own dpm.json, so the tree is on disk: see `readInstalled`.
 *
 * Nothing is pinned. Fetched packages are cached like anything the node downloads; the user decides whether to
 * keep them after checking them (`dpm tree --flat | ipfs pin add`). See docs/engineering.md.
 *
 * DPM gives every package its own folder, named by CID, so two packages never collide on disk and the same
 * package is installed once. What packages mean, and what to do if two of them clash, is up to the tools that
 * use them.
 */
export async function install(dir: string, kubo: Kubo, opts: FetchOptions = {}): Promise<Graph> {
    const graph = await fetchTree(kubo, readManifest(dir).deps, opts);
    const deps = path.join(dir, DEPS);
    fs.mkdirSync(deps, { recursive: true });
    for (const cid of Object.keys(graph.packages)) {
        const dest = path.join(deps, cid);
        // Content never changes under a CID, so an existing folder is kept.
        if (!fs.existsSync(dest)) await kubo.exportTo(cid, dest);
    }
    for (const name of fs.readdirSync(deps))
        if (isCid(name) && !graph.packages[name]) fs.rmSync(path.join(deps, name), { recursive: true, force: true });
    // DPM 0.3.1 and earlier also wrote the tree to deps/graph.json; it repeated what the dpm.json files say.
    fs.rmSync(path.join(deps, 'graph.json'), { force: true });
    return graph;
}

/**
 * The tree installed in a project, read from disk: the project's own dpm.json, then each installed package's
 * dpm.json in `deps/<cid>/`. Fails if a package in the tree isn't installed (run `dpm install`).
 */
export function readInstalled(dir: string): Graph {
    const root = readManifest(dir).deps;
    const packages: Record<string, { deps: readonly string[] }> = {};
    const queue = [...root];
    for (let cid = queue.shift(); cid !== undefined; cid = queue.shift()) {
        if (packages[cid]) continue;
        const folder = path.join(dir, DEPS, cid);
        if (!fs.existsSync(path.join(folder, MANIFEST)))
            throw new ManifestError(`${cid} is not installed: run 'dpm install'`);
        const deps = readManifest(folder).deps;
        packages[cid] = { deps };
        queue.push(...deps);
    }
    return { root, packages };
}
