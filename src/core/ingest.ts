import { RejectedError } from './errors';
import { Package } from './package';
import { Registry } from './registry';
import { resolve, Resolution } from './resolver';
import { CachingSource, MemorySource, PackageSource } from './source';

/**
 * An extra admission check run after a package resolves and before it is stored.
 * Throw to reject. DPM itself never supplies one; a layer above (e.g. a logic validator) can.
 */
export type Verifier = (pkg: Package, resolution: Resolution) => Promise<void> | void;

export interface IngestOptions {
    /** Where dependencies not in the registry or the batch may be found, in priority order. */
    sources?: readonly PackageSource[];
    /** Optional extra check between resolve and put. */
    verify?: Verifier;
}

/**
 * The one way packages should enter a registry: resolve, then (optionally) verify, then put.
 *
 * Every package in `batch` must resolve, using the registry itself, the rest of the batch and then
 * `sources` to find dependencies. Dependencies found in `sources` are used for resolution but NOT
 * stored. A registry is not required to hold the closure of what it stores.
 *
 * All-or-nothing: if any package fails to resolve or verify, nothing is stored.
 *
 * Returns the packages that were newly stored, dependencies first.
 */
export async function ingest(
    registry: Registry,
    batch: readonly Package[],
    options: IngestOptions = {},
): Promise<Package[]> {
    const present = await registry.has(batch.map((p) => p.id));
    const candidates = dedupe(batch).filter((p) => !present.has(p.id));
    if (candidates.length === 0) return [];

    const lookup = [registry, new MemorySource(batch, 'batch'), new CachingSource(options.sources ?? [])];
    const accepted: Package[] = [];
    for (const pkg of candidates) {
        const resolution = await resolve(pkg, lookup);
        if (options.verify) {
            try {
                await options.verify(pkg, resolution);
            } catch (e) {
                throw e instanceof RejectedError ? e : new RejectedError(pkg.id, (e as Error).message);
            }
        }
        accepted.push(pkg);
    }

    const ordered = orderWithinBatch(accepted);
    for (const pkg of ordered) await registry.put(pkg);
    return ordered;
}

function dedupe(packages: readonly Package[]): Package[] {
    return [...new Map(packages.map((p) => [p.id, p])).values()];
}

/** Dependencies before dependents, so a crash midway never leaves a stored package whose batch deps are absent. */
function orderWithinBatch(packages: Package[]): Package[] {
    const byId = new Map(packages.map((p) => [p.id, p]));
    const done = new Set<string>();
    const out: Package[] = [];
    const walk = (pkg: Package) => {
        if (done.has(pkg.id)) return;
        done.add(pkg.id);
        for (const dep of pkg.deps) {
            const inBatch = byId.get(dep);
            if (inBatch) walk(inBatch);
        }
        out.push(pkg);
    };
    packages.forEach(walk);
    return out;
}
