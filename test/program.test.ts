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
        expect(names(group('project'))).toEqual(['init', 'install', 'pack', 'dep', 'tree']);
        expect(names(sub(group('project'), 'dep'))).toEqual(['add', 'remove', 'ls']);
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
        expect(names(sub(dpm, 'dep'))).toEqual(['add', 'remove', 'ls']);
    });

    it('has no dpm add or dpm remove: those are dpm dep add and dpm dep remove', () => {
        expect(names(dpm)).not.toContain('add');
        expect(names(dpm)).not.toContain('remove');
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
});
