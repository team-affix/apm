import { describe, expect, it, vi } from 'vitest';
import { ingest, MissingDependencyError, PeerConflictError, Registry, RejectedError } from '../src/core';
import { pkg, source, tmpDir } from './helpers';

const fresh = () => Registry.openOrCreate(tmpDir());

describe('ingest (resolve → verify → put)', () => {
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
        await ingest(reg, [b], { sources: [source(a)] });
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
        await expect(ingest(reg, [bad], { sources: [source(c1, c2, pkg('X', [c1]), pkg('Y', [c2]))] })).rejects.toThrow(
            PeerConflictError,
        );
    });

    it('runs the verifier with the resolution, between resolve and put', async () => {
        const reg = fresh();
        const a = pkg('A');
        const b = pkg('B', [a]);
        const verify = vi.fn(async (p, resolution) => {
            expect(await reg.has([p.id])).toEqual(new Set()); // not stored yet
            expect(resolution.packages.map((d: { id: string }) => d.id)).toEqual(p === b ? [a.id] : []);
        });
        await ingest(reg, [a, b], { verify });
        expect(verify).toHaveBeenCalledTimes(2);
        expect(await reg.list()).toEqual([a.id, b.id].sort());
    });

    it('stores nothing if the verifier rejects any package', async () => {
        const reg = fresh();
        const a = pkg('A');
        const b = pkg('B', [a]);
        const verify = (p: { name: string }) => {
            if (p.name === 'B') throw new Error('B is a contradiction');
        };
        const err = await ingest(reg, [a, b], { verify }).catch((e) => e);
        expect(err).toBeInstanceOf(RejectedError);
        expect((err as RejectedError).id).toBe(b.id);
        expect(err.message).toMatch(/contradiction/);
        expect(await reg.list()).toEqual([]);
    });

    it('skips packages that are already present (and does not re-verify them)', async () => {
        const reg = fresh();
        const a = pkg('A');
        await reg.put(a);
        const verify = vi.fn();
        expect(await ingest(reg, [a, a], { verify })).toEqual([]);
        expect(verify).not.toHaveBeenCalled();
    });
});
