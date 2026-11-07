import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { Registry, RegistryError } from '../src/core';
import { pkg, tmpDir } from './helpers';

describe('Registry', () => {
    it('refuses to open a directory that is not a registry', () => {
        expect(() => Registry.open(tmpDir())).toThrow(RegistryError);
    });

    it('creates on demand and reopens', async () => {
        const dir = path.join(tmpDir(), 'reg');
        const p = pkg('A', [], 'a');
        await Registry.openOrCreate(dir).put(p);
        expect((await Registry.open(dir).get(p.id))?.id).toBe(p.id);
    });

    it('stores, gets, checks and lists by ID', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const a = pkg('A');
        const b = pkg('B', [a]);
        await reg.put(b);
        await reg.put(a);
        expect((await reg.get(b.id))?.bytes.equals(b.bytes)).toBe(true);
        expect(await reg.get(pkg('Missing').id)).toBeUndefined();
        expect(await reg.has([a.id, pkg('Missing').id, 'garbage'])).toEqual(new Set([a.id]));
        expect(await reg.list()).toEqual([a.id, b.id].sort());
    });

    it('does not check dependencies: it is a dumb store', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const orphan = pkg('Orphan', [pkg('NotHere')]);
        await reg.put(orphan);
        expect(await reg.list()).toEqual([orphan.id]);
    });

    it('treats a repeated put as a no-op', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const a = pkg('A');
        await reg.put(a);
        await reg.put(a);
        expect(await reg.list()).toEqual([a.id]);
    });

    it('detects a stored file whose content does not match its ID', async () => {
        const dir = tmpDir();
        const reg = Registry.openOrCreate(dir);
        const a = pkg('A', [], 'original');
        await reg.put(a);
        fs.writeFileSync(path.join(dir, 'packages', a.id), pkg('A', [], 'tampered').bytes);
        await expect(reg.get(a.id)).rejects.toThrow(/corrupt/);
    });

    it('detects a stored file that is not a package', async () => {
        const dir = tmpDir();
        const reg = Registry.openOrCreate(dir);
        const a = pkg('A');
        await reg.put(a);
        fs.writeFileSync(path.join(dir, 'packages', a.id), 'junk');
        await expect(reg.get(a.id)).rejects.toThrow(RegistryError);
    });

    it('never resolves an ID to a path outside the registry', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        expect(await reg.get('../../etc/passwd')).toBeUndefined();
        expect(await reg.has(['../x'])).toEqual(new Set());
    });

    it('ignores stray files when listing', async () => {
        const dir = tmpDir();
        const reg = Registry.openOrCreate(dir);
        fs.writeFileSync(path.join(dir, 'packages', '.tmp-123'), '');
        expect(await reg.list()).toEqual([]);
    });
});
