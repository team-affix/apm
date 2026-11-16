import { Graph } from '../core';

/** Text in a box drawn with box-drawing characters, one line per line of text. */
export function boxed(text: string): string {
    const lines = text.split('\n');
    const width = Math.max(...lines.map((l) => l.length));
    return [`┌─${'─'.repeat(width)}─┐`, ...lines.map((l) => `│ ${l.padEnd(width)} │`), `└─${'─'.repeat(width)}─┘`].join(
        '\n',
    );
}

/**
 * A package and everything under it, drawn as a tree: each package is a box with its CID, and
 * its dependencies hang below it. A package that several others depend on appears under each of them.
 */
export function renderTree(graph: Graph, cid: string, startPrefix = '', midPrefix = ''): string {
    const [first, ...rest] = boxed(cid).split('\n');
    let out = `${startPrefix}${first}\n`;
    for (const line of rest) out += `${midPrefix}${line}\n`;
    const deps = graph.packages[cid]?.deps ?? [];
    deps.forEach((dep, i) => {
        const last = i === deps.length - 1;
        out += renderTree(graph, dep, midPrefix + (last ? '└───' : '├───'), midPrefix + (last ? '    ' : '│   '));
    });
    return out;
}

/** Every package in a tree, each once, one CID per line: for piping, e.g. into `ipfs pin add`. */
export function renderFlat(graph: Graph): string {
    return Object.keys(graph.packages)
        .map((cid) => `${cid}\n`)
        .join('');
}
