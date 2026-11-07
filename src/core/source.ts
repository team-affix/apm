import { Package } from './package';

/**
 * Anywhere packages can be fetched from by ID: the local registry, a remote registry, or an in-memory batch.
 *
 * Sources are untrusted. Whoever reads from a source must check that what came back hashes to the
 * requested ID; `fetchVerified` does that.
 */
export interface PackageSource {
    /** Short description for error messages, e.g. a path or URL. */
    readonly label: string;
    /** The package with this ID, or undefined if this source doesn't have it. */
    get(id: string): Promise<Package | undefined>;
    /** The subset of `ids` this source has. */
    has(ids: readonly string[]): Promise<Set<string>>;
}

/** A source backed by an in-memory list of packages, e.g. a batch someone is pushing. */
export class MemorySource implements PackageSource {
    private readonly byId: Map<string, Package>;

    constructor(
        packages: Iterable<Package>,
        public readonly label = 'memory',
    ) {
        this.byId = new Map([...packages].map((p) => [p.id, p]));
    }

    async get(id: string): Promise<Package | undefined> {
        return this.byId.get(id);
    }

    async has(ids: readonly string[]): Promise<Set<string>> {
        return new Set(ids.filter((id) => this.byId.has(id)));
    }
}

/**
 * Asks each source in order for `id` and returns the first package whose content really hashes to `id`.
 * A source that errors or returns the wrong content is skipped, not trusted.
 */
export async function fetchVerified(id: string, sources: readonly PackageSource[]): Promise<Package | undefined> {
    for (const source of sources) {
        let pkg: Package | undefined;
        try {
            pkg = await source.get(id);
        } catch {
            continue;
        }
        // Hash verification: never trust a source to return what was asked for. A Package's id is
        // always computed from its own bytes (the constructor is private), so this compares hashes.
        if (pkg?.id === id) return pkg;
    }
    return undefined;
}

/** Wraps sources so each ID is fetched at most once. Useful when many resolutions share the same sources. */
export class CachingSource implements PackageSource {
    private readonly cache = new Map<string, Promise<Package | undefined>>();
    public readonly label: string;

    constructor(private readonly sources: readonly PackageSource[]) {
        this.label = sources.map((s) => s.label).join(', ');
    }

    get(id: string): Promise<Package | undefined> {
        let hit = this.cache.get(id);
        if (!hit) {
            hit = fetchVerified(id, this.sources);
            this.cache.set(id, hit);
        }
        return hit;
    }

    async has(ids: readonly string[]): Promise<Set<string>> {
        const found = await Promise.all(ids.map(async (id) => ((await this.get(id)) ? id : undefined)));
        return new Set(found.filter((id): id is string => id !== undefined));
    }
}
