import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { readManifest, writeManifest } from '../src/core';
import { tmpDir } from './helpers';
import { program } from '../src/client/program';

describe('the dpm command line', () => {
    const dpm = program();
    const names = (c: { commands: readonly { name(): string }[] }) => c.commands.map((s) => s.name());
    /** A command of `parent` by name; fails the test if there's none. */
    const sub = (parent: typeof dpm, name: string) => {
        const found = parent.commands.find((c) => c.name() === name);
        if (!found) throw new Error(`no command '${name}'`);
        return found;
    };
    const group = (name: string) => sub(dpm, name);

    it('groups commands by what they act on: project (with dep), package, node', () => {
        expect(names(group('project'))).toEqual(['init', 'install', 'clean', 'pack', 'dep', 'tree']);
        expect(names(sub(group('project'), 'dep'))).toEqual(['add', 'rm', 'ls']);
        expect(names(group('package'))).toEqual(['tree']);
        expect(names(group('node'))).toEqual(['show', 'set', 'reset']);
    });

    it('has a shorthand for every project command, matching the long form; dpm dep has all of dep', () => {
        for (const long of group('project').commands) {
            const short = sub(dpm, long.name());
            expect(short.description()).toBe(`(dpm project ${long.name()}) ${long.description()}`);
            for (const [s, l] of [[short, long], ...long.commands.map((c) => [sub(short, c.name()), c] as const)]) {
                expect(s.registeredArguments.map((a) => a.name())).toEqual(l.registeredArguments.map((a) => a.name()));
                expect(s.options.map((o) => o.flags)).toEqual(l.options.map((o) => o.flags));
            }
        }
        expect(names(sub(dpm, 'dep'))).toEqual(['add', 'rm', 'ls']);
    });

    it('has no dpm add, rm or remove: those are dpm dep add and dpm dep rm', () => {
        expect(names(dpm)).not.toContain('add');
        expect(names(dpm)).not.toContain('remove');
        expect(names(dpm)).not.toContain('rm');
        expect(names(sub(dpm, 'dep'))).not.toContain('remove');
    });

    it('has no top-level dpm ls: direct dependencies are dpm dep ls, the installed tree dpm tree', () => {
        expect(names(dpm)).not.toContain('ls');
    });

    it('dpm dep ls prints only the direct dependencies, from dpm.json; dpm dep add is dpm project dep add', async () => {
        const A = 'bafybeieedcwo4wyypn4l2r73564segyb3evs7zeeomxbci7pedrif3c2pu';
        const B = 'bafybeielfcvgt3wpq3y5aeg3j7n4iz4lpylgqex436uhz6xkepefn524di';
        const dir = tmpDir();
        writeManifest(dir, { deps: [A] });
        await program().parseAsync(['node', 'dpm', '-C', dir, 'dep', 'add', B]);
        expect(readManifest(dir).deps).toEqual([A, B]);

        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            await program().parseAsync(['node', 'dpm', '-C', dir, 'dep', 'ls']);
            await program().parseAsync(['node', 'dpm', '-C', dir, 'project', 'dep', 'ls']);
            expect(log.mock.calls).toEqual([[A], [B], [A], [B]]);
        } finally {
            log.mockRestore();
        }
    });

    it('dpm clean deletes deps/ and nothing else, only in a DPM project', async () => {
        const dir = tmpDir();
        writeManifest(dir, { deps: [] });
        fs.mkdirSync(path.join(dir, 'deps', 'bafyexample'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'Main.ul'), 'x : p;');
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            await program().parseAsync(['node', 'dpm', '-C', dir, 'clean']);
            expect(fs.readdirSync(dir).sort()).toEqual(['Main.ul', 'dpm.json']);
            await program().parseAsync(['node', 'dpm', '-C', dir, 'project', 'clean']);
            expect(log.mock.calls.at(-1)).toEqual(['nothing to clean: no deps/ folder']);
        } finally {
            log.mockRestore();
        }

        // Not a DPM project: its deps/ folder is left alone.
        const other = tmpDir();
        fs.mkdirSync(path.join(other, 'deps'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await program().parseAsync(['node', 'dpm', '-C', other, 'clean']);
            expect(error.mock.calls[0]?.[0]).toMatch(/is not a DPM project/);
            expect(fs.existsSync(path.join(other, 'deps'))).toBe(true);
        } finally {
            error.mockRestore();
            process.exitCode = 0;
        }
    });
});
