import { describe, expect, it } from 'vitest';
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

    it('groups commands by what they act on: project, package, node', () => {
        expect(names(group('project'))).toEqual(['init', 'add', 'remove', 'install', 'pack', 'tree']);
        expect(names(group('package'))).toEqual(['tree']);
        expect(names(group('node'))).toEqual(['show', 'set', 'reset']);
    });

    it('has a shorthand for every project command, with the same arguments and options', () => {
        for (const long of group('project').commands) {
            const short = sub(dpm, long.name());
            expect(short.registeredArguments.map((a) => a.name())).toEqual(
                long.registeredArguments.map((a) => a.name()),
            );
            expect(short.options.map((o) => o.flags)).toEqual(long.options.map((o) => o.flags));
            expect(short.description()).toBe(`(dpm project ${long.name()}) ${long.description()}`);
        }
    });

    it('has no dpm ls: the installed tree is dpm tree --flat', () => {
        expect(names(dpm)).not.toContain('ls');
    });
});
