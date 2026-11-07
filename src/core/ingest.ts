import { Package } from './package';
import { Registry } from './registry';
import { resolve } from './resolver';
import { CachingSource, MemorySource, PackageSource } from './source';

/**
 * The reference admission sequence: every package in `batch` must belong to a dependency tree that
 * resolves, then all of them are stored.
 *
 * Packages arrive here already hash-verified: a `Package` can only be obtained by decoding bytes
 * (see `Package.decodeAs`), so its ID is always the hash of its content.
 *
 * Dependencies are looked up in the registry, then the rest of the batch, then `sources`. What is
 * found in `sources` is used for resolution but NOT stored: a registry is not required to hold the
 * closure of what it stores.
 *
 * Overrides are hierarchical, so a package deep in a pushed tree may only resolve under the overrides
 * of the packages above it (its own dependency on an overridden package may be unavailable anywhere).
 * So the batch's top-level packages are resolved first, and every package inside one of their trees
 * is accepted as part of it. Any package not inside another one's tree must resolve on its own.
 *
 * All-or-nothing: if any tree fails to resolve, nothing is stored. Returns the newly stored packages,
 * dependencies first.
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
    const ordered = dependenciesFirst(candidates);
    const covered = new Set<string>();
    // Dependents first, so each top-level package is resolved before anything inside its tree.
    for (const pkg of [...ordered].reverse()) {
        if (covered.has(pkg.id)) continue;
        const resolution = await resolve(pkg, lookup);
        covered.add(pkg.id);
        for (const dep of resolution.packages) covered.add(dep.id);
    }

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
