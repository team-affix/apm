import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DpmError, fetchTree, Kubo, readManifest, readPackageFolder } from '../core';

/**
 * Writes the package a project folder makes (everything except `deps/` and hidden files) to a new folder, and
 * returns the folder. The folder is `out`, which must not exist yet, or else a new temporary folder named by a
 * random GUID, so it looks like what it is: the package, to be added as it is (`ipfs add -r <folder>`), not a
 * project to edit.
 *
 * Nothing touches IPFS.
 */
export function pack(dir: string, out?: string): string {
    readManifest(dir);
    const entries = readPackageFolder(dir);
    const folder = out ? path.resolve(out) : path.join(os.tmpdir(), randomUUID());
    if (fs.existsSync(folder)) throw new DpmError(`${folder} already exists: pack writes a new folder`);
    fs.mkdirSync(path.dirname(folder), { recursive: true });
    fs.mkdirSync(folder);
    for (const e of entries) {
        const target = path.join(folder, ...e.path.split('/'));
        if (e.dir) fs.mkdirSync(target, { recursive: true });
        else fs.writeFileSync(target, e.content);
    }
    return folder;
}

/**
 * A package and every package it depends on, recursively, each once: the package first. For example, to pin a
 * whole tree: `dpm tree <cid> | ipfs pin add`.
 */
export async function tree(cid: string, kubo: Kubo): Promise<string[]> {
    return Object.keys((await fetchTree(kubo, [cid])).packages);
}
