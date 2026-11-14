import fs from 'fs';
import path from 'path';
import { ManifestError } from './errors';

/**
 * A package is any directory. Its `dpm.json` lists the packages it depends on, by CID, and nothing else:
 * DPM has no package names. A package's name is its CID, and what is inside it (folder names included) is
 * part of its content and so part of its CID.
 */
export interface Manifest {
    /** CIDs of the packages this one depends on: unique and sorted. */
    readonly deps: readonly string[];
}

export const MANIFEST = 'dpm.json';

/** CIDv1 in base32 (`b...`), as DPM writes them, or CIDv0 (`Qm...`). */
const CID = /^(b[a-z2-7]{50,100}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;

export function isCid(s: string): boolean {
    return CID.test(s);
}

export function assertCid(s: string): string {
    if (!isCid(s)) throw new ManifestError(`Not a CID: '${s}'`);
    return s;
}

/** A manifest with its dependencies deduplicated and sorted, so equal manifests are equal files. */
export function manifest(deps: readonly string[]): Manifest {
    return { deps: [...new Set(deps.map(assertCid))].sort() };
}

/** Parses dpm.json text. `where` names the source in errors. */
export function parseManifest(text: string, where: string): Manifest {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new ManifestError(`${where} is not valid JSON`);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        throw new ManifestError(`${where} must be a JSON object: { "deps": [CID, ...] }`);
    const unknown = Object.keys(data).filter((k) => k !== 'deps');
    if (unknown.length) throw new ManifestError(`${where} has unknown field(s): ${unknown.join(', ')}`);
    const deps = (data as { deps?: unknown }).deps ?? [];
    if (!Array.isArray(deps) || !deps.every((d) => typeof d === 'string'))
        throw new ManifestError(`${where}: "deps" must be an array of CIDs`);
    try {
        return manifest(deps as string[]);
    } catch (e) {
        throw new ManifestError(`${where}: ${(e as Error).message}`);
    }
}

export const showManifest = (m: Manifest): string => JSON.stringify({ deps: m.deps }, null, 4) + '\n';

/** Reads a project's dpm.json. A directory without one is a package with no dependencies. */
export function readManifest(dir: string): Manifest {
    const file = path.join(dir, MANIFEST);
    if (!fs.existsSync(file)) return { deps: [] };
    return parseManifest(fs.readFileSync(file, 'utf8'), file);
}

export function writeManifest(dir: string, m: Manifest): void {
    fs.writeFileSync(path.join(dir, MANIFEST), showManifest(manifest(m.deps)));
}
