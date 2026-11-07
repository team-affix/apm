import { Package } from './package';
import { Registry } from './registry';
import { resolve } from './resolver';
import { CachingSource, MemorySource, PackageSource } from './source';

/**
 * The reference admission sequence: every package in `batch` must resolve, then all of them are stored.
 *
 * Packages arrive here already hash-verified: a `Package` can only be obtained by decoding bytes
 * (see `Package.decodeAs`), so its ID is always the hash of its content.
 *
 * Dependencies are looked up in the registry, then the rest of the batch, then `sources`. What is
 * found in `sources` is used for resolution but NOT stored: a registry is not required to hold the
 * closure of what it stores.
 *
 * All-or-nothing: if any package fails to resolve, nothing is stored. Returns the newly stored
 * packages, dependencies first.
 *
 * This is a convenience, not a contract. A server or client with its own acceptance policy (e.g. a
 * logic validator) composes `resolve` and `Registry.put` in whatever order it needs.
 */
export async function ingest(
    registry: Registry,
    batch: readonly Package[],
    sources: readonly PackageSource[] = [],
): Promise<Package[]> {
    const present = await registry.has(batch.map((p) => p.id));
    const candidates = dedupe(batch).filter((p) => !present.has(p.id));
    if (candidates.length === 0) return [];

    const lookup = [registry, new MemorySource(batch, 'batch'), new CachingSource(sources)];
    for (const pkg of candidates) await resolve(pkg, lookup);

    const ordered = dependenciesFirst(candidates);
    for (const pkg of ordered) await registry.put(pkg);
    return ordered;
}

function dedupe(packages: readonly Package[]): Package[] {
    return [...new Map(packages.map((p) => [p.id, p])).values()];
}

/**
 * Orders packages so each comes after any of its dependencies in the same list. Storing in this
 * order means a crash midway never leaves a stored package whose in-batch dependencies are absent.
 */
export function dependenciesFirst(packages: readonly Package[]): Package[] {
    const byId = new Map(packages.map((p) => [p.id, p]));
    const done = new Set<string>();
    const out: Package[] = [];
    const walk = (pkg: Package) => {
        if (done.has(pkg.id)) return;
        done.add(pkg.id);
        for (const dep of pkg.deps) {
            const inList = byId.get(dep);
            if (inList) walk(inList);
        }
        out.push(pkg);
    };
    packages.forEach(walk);
    return out;
}
