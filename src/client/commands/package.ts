import { Command } from 'commander';
import { assertCid, fetchTree } from '../../core';
import { ClientConfig } from '../config';
import { renderFlat, renderTree } from '../render';
import { run, TIMEOUT } from './run';

/** `dpm package ...`: commands on a package, by CID, read through Kubo. No project needed. */
export const packageCommands = {
    tree: () =>
        new Command('tree')
            .description(
                'Draw a package and every package it depends on, recursively, fetched through Kubo (nothing is pinned). ' +
                    'With --flat: each once, one CID per line (e.g. to keep them all: dpm package tree <cid> --flat | ipfs pin add)',
            )
            .argument('<cid>')
            .option('--flat', 'one CID per line, each once, instead of a drawing')
            .option(...TIMEOUT)
            .action(
                run(async (_dir, cid: string, opts: { flat?: boolean; timeout: string }) => {
                    // Fetches the whole tree before printing anything: an incomplete tree prints nothing.
                    const graph = await fetchTree(ClientConfig.load().kubo(opts.timeout), [assertCid(cid)]);
                    process.stdout.write(opts.flat ? renderFlat(graph) : renderTree(graph, cid));
                }),
            ),
};

export function packageCommand(): Command {
    const pkg = new Command('package').description(
        'Commands on any package, by CID, read through Kubo (no project needed)',
    );
    for (const make of Object.values(packageCommands)) pkg.addCommand(make());
    return pkg;
}
