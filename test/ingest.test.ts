import { describe, expect, it } from 'vitest';
import { dependenciesFirst, ingest, MissingDependencyError, PeerConflictError, Registry } from '../src/core';
import { pkg, source, tmpDir } from './helpers';

const fresh = () => Registry.openOrCreate(tmpDir());

describe('ingest (resolve → put)', () => {
    it('stores a package whose dependencies are already in the registry', async () => {
        const reg = fresh();
        const a = pkg('A');
        await reg.put(a);
        const b = pkg('B', [a]);
        expect((await ingest(reg, [b])).map((p) => p.id)).toEqual([b.id]);
        expect(await reg.has([b.id])).toEqual(new Set([b.id]));
    });

    it('stores a batch whose packages depend on each other, dependencies first', async () => {
        const reg = fresh();
        const a = pkg('A');
        const b = pkg('B', [a]);
        const c = pkg('C', [b]);
        const stored = await ingest(reg, [c, b, a]);
        expect(stored.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    });

    it('uses outside sources for resolution without storing what it fetched', async () => {
        const reg = fresh();
        const a = pkg('A');
        const b = pkg('B', [a]);
        await ingest(reg, [b], [source(a)]);
        expect(await reg.list()).toEqual([b.id]);
    });

    it('rejects a package with a dependency nobody provides, and stores nothing', async () => {
        const reg = fresh();
        const ok = pkg('Ok');
        const bad = pkg('Bad', [pkg('Nowhere')]);
        await expect(ingest(reg, [ok, bad])).rejects.toThrow(MissingDependencyError);
        expect(await reg.list()).toEqual([]);
    });

    it('rejects a package with an unresolved peer conflict', async () => {
        const reg = fresh();
        const c1 = pkg('C', [], '1');
        const c2 = pkg('C', [], '2');
        const bad = pkg('Bad', [pkg('X', [c1]), pkg('Y', [c2])]);
        await expect(ingest(reg, [bad], [source(c1, c2, pkg('X', [c1]), pkg('Y', [c2]))])).rejects.toThrow(
            PeerConflictError,
        );
    });

    it('accepts a deep package that only resolves under the overrides of a package above it', async () => {
        const reg = fresh();
        const c1 = pkg('C', [], 'gone');
        const c2 = pkg('C', [], '2');
        const x = pkg('X', [c1]);
        const root = pkg('Root', [x, c2]);
        const stored = await ingest(reg, [x, c2, root]);
        expect(stored.map((p) => p.name).sort()).toEqual(['C', 'Root', 'X']);
        expect(stored.at(-1)?.id).toBe(root.id);
        expect(await reg.has([c1.id])).toEqual(new Set());
    });

    it('resolves a batch package on its own when nothing above it covers it', async () => {
        const reg = fresh();
        const c1 = pkg('C', [], 'gone');
        const c2 = pkg('C', [], '2');
        const x = pkg('X', [c1]);
        const root = pkg('Root', [pkg('Y'), c2]);
        // x is not in root's tree, so it must stand on its own, and it can't
        await expect(ingest(reg, [x, c2, pkg('Y'), root])).rejects.toThrow(MissingDependencyError);
        expect(await reg.list()).toEqual([]);
    });

    it('skips packages that are already present', async () => {
        const reg = fresh();
        const a = pkg('A');
        await reg.put(a);
        expect(await ingest(reg, [a, a])).toEqual([]);
    });

    it('dependenciesFirst orders any list so in-list dependencies come first', () => {
        const a = pkg('A');
        const b = pkg('B', [a]);
        const c = pkg('C', [b, pkg('Elsewhere')]);
        expect(dependenciesFirst([c, b, a]).map((p) => p.name)).toEqual(['A', 'B', 'C']);
    });
});
