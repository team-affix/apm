import { describe, expect, it } from 'vitest';
import { boxed, renderFlat, renderTree } from '../src/client';
import { Graph } from '../src/core';

describe('drawing trees', () => {
    it('boxes text', () => {
        expect(boxed('abc')).toBe('┌─────┐\n│ abc │\n└─────┘');
    });

    it('hangs each dependency below its package, with ├─── and └───, and repeats a shared one', () => {
        // app depends on kant and mill, which both depend on logic.
        const graph: Graph = {
            root: ['app'],
            packages: {
                app: { deps: ['kant', 'mill'] },
                kant: { deps: ['logic'] },
                mill: { deps: ['logic'] },
                logic: { deps: [] },
            },
        };
        expect(renderTree(graph, 'app')).toBe(
            [
                '┌─────┐',
                '│ app │',
                '└─────┘',
                '├───┌──────┐',
                '│   │ kant │',
                '│   └──────┘',
                '│   └───┌───────┐',
                '│       │ logic │',
                '│       └───────┘',
                '└───┌──────┐',
                '    │ mill │',
                '    └──────┘',
                '    └───┌───────┐',
                '        │ logic │',
                '        └───────┘',
                '',
            ].join('\n'),
        );
    });

    it('lists each package once for --flat', () => {
        const graph: Graph = {
            root: ['a'],
            packages: { a: { deps: ['b', 'c'] }, b: { deps: ['c'] }, c: { deps: [] } },
        };
        expect(renderFlat(graph)).toBe('a\nb\nc\n');
    });
});
