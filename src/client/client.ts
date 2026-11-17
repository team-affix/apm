import { fetchTree, Kubo, readManifest, readPackageFolder } from '../core';

/**
 * Adds the project's package to Kubo, which pins it, and returns its CID: everything in the project folder except
 * `deps/` and hidden files (names starting with `.`). The project must have a dpm.json.
 */
export async function pack(dir: string, kubo: Kubo): Promise<string> {
    readManifest(dir);
    return kubo.addFolder(readPackageFolder(dir));
}

/**
 * A package and every package it depends on, recursively, each once: the package first. For example, to pin a
 * whole tree: `dpm package tree <cid> --flat | ipfs pin add`.
 */
export async function tree(cid: string, kubo: Kubo): Promise<string[]> {
    return Object.keys((await fetchTree(kubo, [cid])).packages);
}
