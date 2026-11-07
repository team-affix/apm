import { describe, expect, it } from 'vitest';
import { formatTree, MissingDependencyError, Package, PackageSource, PeerConflictError, resolve } from '../src/core';
import { pkg, source } from './helpers';

const ids = (packages: readonly Package[]) => packages.map((p) => p.id);
const names = (packages: readonly Package[]) => packages.map((p) => p.name).sort();

/** A source that records which IDs were requested. */
function spy(inner: PackageSource): PackageSource & { requested: string[] } {
    const requested: string[] = [];
    return {
        label: 'spy',
        requested,
        get: (id) => {
            requested.push(id);
            return inner.get(id);
        },
        has: (list) => inner.has(list),
    };
}

describe('resolve', () => {
    it('resolves an empty project', async () => {
        const r = await resolve({ name: 'Root', deps: [] }, []);
        expect(r.packages).toEqual([]);
        expect(r.tree).toEqual([]);
    });

    it('resolves a chain, dependencies first', async () => {
        const c = pkg('C');
        const b = pkg('B', [c]);
        const a = pkg('A', [b]);
        const r = await resolve(a, [source(a, b, c)]);
        expect(ids(r.packages)).toEqual([c.id, b.id]);
        expect(formatTree(r)).toBe(`A\n└── ${b.id}\n    └── ${c.id}`);
    });

    it('accepts a diamond where both paths reach the same package', async () => {
        const d = pkg('D');
        const b = pkg('B', [d]);
        const c = pkg('C', [d]);
        const r = await resolve({ name: 'Root', deps: [b.id, c.id] }, [source(b, c, d)]);
        expect(names(r.packages)).toEqual(['B', 'C', 'D']);
        const order = ids(r.packages);
        expect(order.indexOf(d.id)).toBeLessThan(order.indexOf(b.id));
        expect(order.indexOf(d.id)).toBeLessThan(order.indexOf(c.id));
    });

    it('rejects two direct dependencies with the same name', async () => {
        const x1 = pkg('X', [], '1');
        const x2 = pkg('X', [], '2');
        await expect(resolve({ name: 'Root', deps: [x1.id, x2.id] }, [source(x1, x2)])).rejects.toThrow(
            PeerConflictError,
        );
    });

    it('rejects a peer conflict between subtrees', async () => {
        const c1 = pkg('C', [], 'v1');
        const c2 = pkg('C', [], 'v2');
        const b = pkg('B', [c1]);
        const d = pkg('D', [c2]);
        const err = await resolve({ name: 'Root', deps: [b.id, d.id] }, [source(b, c1, c2, d)]).catch((e) => e);
        expect(err).toBeInstanceOf(PeerConflictError);
        expect((err as PeerConflictError).packageName).toBe('C');
        expect([...(err as PeerConflictError).ids].sort()).toEqual([c1.id, c2.id].sort());
    });

    it('resolves a peer conflict when the root depends directly on the chosen package', async () => {
        const c1 = pkg('C', [], 'v1');
        const c2 = pkg('C', [], 'v2');
        const c3 = pkg('C', [], 'v3');
        const b = pkg('B', [c1]);
        const d = pkg('D', [c2]);
        const r = await resolve({ name: 'Root', deps: [b.id, d.id, c3.id] }, [source(b, c1, c2, c3, d)]);
        expect(names(r.packages)).toEqual(['B', 'C', 'D']);
        expect(ids(r.packages)).toContain(c3.id);
        expect(ids(r.packages)).not.toContain(c1.id);
        expect(ids(r.packages)).not.toContain(c2.id);
    });

    it('overrides a grandchild (deep override)', async () => {
        const e1 = pkg('E', [], 'old');
        const e2 = pkg('E', [], 'new');
        const c = pkg('C', [e1]);
        const b = pkg('B', [c]);
        const r = await resolve({ name: 'Root', deps: [b.id, e2.id] }, [source(b, c, e1, e2)]);
        expect(ids(r.packages)).toContain(e2.id);
        expect(ids(r.packages)).not.toContain(e1.id);
    });

    it('lets an intermediate package override inside its own subtree only', async () => {
        const c1 = pkg('C', [], 'v1');
        const c2 = pkg('C', [], 'v2');
        const x = pkg('X', [c1]);
        const b = pkg('B', [x, c2]); // B pins C = c2 for its subtree
        const r = await resolve({ name: 'Root', deps: [b.id] }, [source(b, x, c1, c2)]);
        expect(ids(r.packages)).toContain(c2.id);
        expect(ids(r.packages)).not.toContain(c1.id);
    });

    it('never fetches overridden dependencies, so they need not exist anywhere', async () => {
        const gone = pkg('C', [], 'unavailable');
        const c = pkg('C', [], 'chosen');
        const b = pkg('B', [gone]);
        const s = spy(source(b, c)); // `gone` is in no source
        const r = await resolve({ name: 'Root', deps: [b.id, c.id] }, [s]);
        expect(ids(r.packages)).toContain(c.id);
        expect(s.requested).not.toContain(gone.id);
    });

    it('lets the root occupy its own name (root dominance)', async () => {
        const otherRoot = pkg('Root', [], 'someone else');
        const b = pkg('B', [otherRoot]);
        const s = spy(source(b));
        const r = await resolve({ name: 'Root', deps: [b.id] }, [s]);
        expect(names(r.packages)).toEqual(['B']);
        expect(s.requested).not.toContain(otherRoot.id);
    });

    it('detects a conflict that only appears under a different override context', async () => {
        // E is reached twice: under B (which overrides C) and under D (which doesn't).
        // Under D, E's C1 is live and conflicts with B's C2, whichever path is explored first.
        const c1 = pkg('C', [], 'v1');
        const c2 = pkg('C', [], 'v2');
        const e = pkg('E', [c1]);
        const b = pkg('B', [e, c2]);
        const d = pkg('D', [e]);
        const all = source(b, c1, c2, d, e);
        await expect(resolve({ name: 'Root', deps: [b.id, d.id] }, [all])).rejects.toThrow(PeerConflictError);
        await expect(resolve({ name: 'Root', deps: [d.id, b.id] }, [all])).rejects.toThrow(PeerConflictError);
    });

    it('reports every missing dependency at once, with who required it', async () => {
        const m1 = pkg('M1');
        const m2 = pkg('M2');
        const b = pkg('B', [m1]);
        const err = await resolve({ name: 'Root', deps: [b.id, m2.id] }, [source(b)]).catch((e) => e);
        expect(err).toBeInstanceOf(MissingDependencyError);
        expect((err as MissingDependencyError).missing).toEqual(
            expect.arrayContaining([
                { id: m1.id, requiredBy: b.id },
                { id: m2.id, requiredBy: 'Root' },
            ]),
        );
    });

    it('tries sources in order and falls through to later ones', async () => {
        const b = pkg('B');
        const c = pkg('C');
        const first = spy(source(b));
        const second = spy(source(b, c));
        const r = await resolve({ name: 'Root', deps: [b.id, c.id] }, [first, second]);
        expect(names(r.packages)).toEqual(['B', 'C']);
        expect(second.requested).toEqual([c.id]);
    });

    it('ignores a source that serves the wrong content for an ID', async () => {
        const real = pkg('B', [], 'real');
        const fake = pkg('B', [], 'fake');
        const liar: PackageSource = { label: 'liar', get: async () => fake, has: async (l) => new Set(l) };
        const r = await resolve({ name: 'Root', deps: [real.id] }, [liar, source(real)]);
        expect(ids(r.packages)).toEqual([real.id]);
        await expect(resolve({ name: 'Root', deps: [real.id] }, [liar])).rejects.toThrow(MissingDependencyError);
    });

    it('skips a source that throws', async () => {
        const b = pkg('B');
        const broken: PackageSource = {
            label: 'broken',
            get: async () => {
                throw new Error('down');
            },
            has: async () => new Set(),
        };
        const r = await resolve({ name: 'Root', deps: [b.id] }, [broken, source(b)]);
        expect(ids(r.packages)).toEqual([b.id]);
    });

    it('rejects a malformed root', async () => {
        await expect(resolve({ name: 'a/b', deps: [] }, [])).rejects.toThrow();
        await expect(resolve({ name: 'Root', deps: ['nope'] }, [])).rejects.toThrow();
    });
});
