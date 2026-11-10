import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DpmError, MissingDependencyError, nameOf, Package, Registry } from '../src/core';
import { Project } from '../src/client';
import { readTree, tmpDir, writeTree } from './helpers';
import { startServer } from './server-helpers';

/** Creates a project with files, packs it into the registry, and returns the package. */
async function publish(reg: Registry, name: string, files: Record<string, string>, deps: string[] = []) {
    const dir = tmpDir();
    const project = Project.init(dir, name);
    deps.forEach((d) => project.add(d));
    writeTree(project.sourceDir, files);
    return project.pack(reg);
}

describe('Project', () => {
    it('initializes a manifest and a source directory', () => {
        const dir = tmpDir();
        Project.init(dir, 'Mine');
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'dpm.json'), 'utf8'))).toEqual({ name: 'Mine', deps: [] });
        expect(fs.statSync(path.join(dir, 'Mine')).isDirectory()).toBe(true);
        expect(() => Project.init(dir, 'Mine')).toThrow(DpmError);
    });

    it('rejects a malformed manifest', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'dpm.json'), JSON.stringify({ name: 'X', deps: ['bad'] }));
        expect(() => Project.load(dir)).toThrow();
        expect(() => Project.load(tmpDir())).toThrow(DpmError);
    });

    it('adds, replaces by name, and removes dependencies', () => {
        const project = Project.init(tmpDir(), 'Mine');
        const v1 = Package.create('Lib', [], Buffer.from('1')).id;
        const v2 = Package.create('Lib', [], Buffer.from('2')).id;
        expect(project.add(v1)).toBeUndefined();
        expect(project.add(v2)).toBe(v1);
        expect(Project.load(project.dir).deps).toEqual([v2]);
        project.remove('Lib');
        expect(Project.load(project.dir).deps).toEqual([]);
        expect(() => project.remove('Lib')).toThrow(DpmError);
        expect(() => project.add(Package.create('Mine', []).id)).toThrow(DpmError);
    });

    it('packs deterministically: same content, same ID', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const one = await publish(reg, 'Same', { 'a.txt': 'x' });
        const two = await publish(reg, 'Same', { 'a.txt': 'x' });
        expect(one.id).toBe(two.id);
        expect((await publish(reg, 'Same', { 'a.txt': 'y' })).id).not.toBe(one.id);
    });

    it('refuses to pack a project whose dependencies do not resolve', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const missing = Package.create('Gone', []).id;
        await expect(publish(reg, 'Mine', {}, [missing])).rejects.toThrow(MissingDependencyError);
        expect(await reg.list()).toEqual([]);
    });

    it('installs the resolved tree into deps/<name>/', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const base = await publish(reg, 'Base', { 'axioms.txt': 'A1' });
        const mid = await publish(reg, 'Mid', { 'thm.txt': 'T1' }, [base.id]);

        const project = Project.init(tmpDir(), 'App');
        project.add(mid.id);
        const resolution = await project.install(reg);
        expect(resolution.packages.map((p) => p.name)).toEqual(['Base', 'Mid']);
        expect(readTree(project.depsDir)).toEqual({ 'Base/axioms.txt': 'A1', 'Mid/thm.txt': 'T1' });
    });

    it('installs a tree whose overridden packages exist nowhere', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const gone = Package.create('C', [], Buffer.from('never published'));
        const c2 = await publish(reg, 'C', { 'v.txt': '2' });
        const x = Package.create('X', [gone.id], Buffer.alloc(0));
        await reg.put(x); // X was published elsewhere against a C that has since vanished

        const project = Project.init(tmpDir(), 'App');
        project.add(x.id);
        project.add(c2.id); // the project overrides C
        const resolution = await project.install(reg);
        expect(resolution.packages.map((p) => p.id).sort()).toEqual([c2.id, x.id].sort());
        expect(readTree(project.depsDir)).toEqual({ 'C/v.txt': '2' });
    });

    it('reinstalls cleanly, dropping packages no longer in the tree', async () => {
        const reg = Registry.openOrCreate(tmpDir());
        const a = await publish(reg, 'A', { f: '1' });
        const project = Project.init(tmpDir(), 'App');
        project.add(a.id);
        await project.install(reg);
        project.remove('A');
        await project.install(reg);
        expect(fs.readdirSync(project.depsDir)).toEqual([]);
    });

    it('installs from remotes, keeping a local copy of what it fetched', async () => {
        const server = await startServer();
        const origin = Registry.openOrCreate(tmpDir());
        const lib = await publish(origin, 'Lib', { 'x.txt': 'remote content' });
        await server.remote.push([lib]);

        const reg = Registry.openOrCreate(tmpDir());
        const project = Project.init(tmpDir(), 'App');
        project.add(lib.id);
        await project.install(reg, [server.remote]);
        expect(readTree(project.depsDir)).toEqual({ 'Lib/x.txt': 'remote content' });
        expect(await reg.list()).toEqual([lib.id]);
        expect(nameOf(lib.id)).toBe('Lib');
    });
});
