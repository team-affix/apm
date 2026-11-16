import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { assertCid, DEPS, DpmError, install, MANIFEST, readInstalled, readManifest, writeManifest } from '../../core';
import { pack } from '../client';
import { ClientConfig } from '../config';
import { renderFlat, renderTree } from '../render';
import { run, TIMEOUT } from './run';

/**
 * `dpm project ...`: commands on the project in the current directory (or `-C <dir>`). Each command is built by
 * one function, used both for `dpm project <name>` and for its shorthand `dpm <name>` (see program.ts).
 */
export const projectCommands = {
    init: () =>
        new Command('init').description('Make the project directory a DPM package: create its dpm.json').action(
            run((dir) => {
                if (fs.existsSync(path.join(dir, MANIFEST))) throw new DpmError(`${MANIFEST} already exists`);
                writeManifest(dir, { deps: [] });
                console.log(`created ${path.join(dir, MANIFEST)}`);
            }),
        ),

    add: () =>
        new Command('add')
            .description("Add direct dependencies to the project's dpm.json, by CID")
            .argument('<cid...>')
            .action(
                run((dir, cids: string[]) => {
                    writeManifest(dir, { deps: [...readManifest(dir).deps, ...cids.map(assertCid)] });
                }),
            ),

    remove: () =>
        new Command('remove')
            .description("Remove direct dependencies from the project's dpm.json")
            .argument('<cid...>')
            .action(
                run((dir, cids: string[]) => {
                    const { deps } = readManifest(dir);
                    const missing = cids.filter((c) => !deps.includes(c));
                    if (missing.length) throw new DpmError(`Not a dependency: ${missing.join(', ')}`);
                    writeManifest(dir, { deps: deps.filter((d) => !cids.includes(d)) });
                }),
            ),

    install: () =>
        new Command('install')
            .description(
                'Fetch every dependency, by CID, into deps/<cid>/. Nothing is pinned: fetched data is only cached.',
            )
            .option(...TIMEOUT)
            .action(
                run(async (dir, opts: { timeout: string }) => {
                    const graph = await install(dir, ClientConfig.load().kubo(opts.timeout));
                    const n = Object.keys(graph.packages).length;
                    console.log(`installed ${n} package${n === 1 ? '' : 's'} into ${path.join(dir, DEPS)}`);
                }),
            ),

    pack: () =>
        new Command('pack')
            .description(
                "Write the project's package (everything except deps/ and hidden files) to a new folder, and print the " +
                    'folder. Without -o, it is a temporary folder named by a random GUID. Add it with: ipfs add -r -Q "$(dpm pack)"',
            )
            .option('-o, --out <folder>', 'write the package to this new folder instead')
            .action(run((dir, opts: { out?: string }) => console.log(pack(dir, opts.out)))),

    tree: () =>
        new Command('tree')
            .description(
                "Draw the project's installed dependency tree. With --flat: every installed package once, one CID per " +
                    'line (e.g. to keep them all: dpm tree --flat | ipfs pin add)',
            )
            .option('--flat', 'one CID per line, each once, instead of a drawing')
            .action(
                run((dir, opts: { flat?: boolean }) => {
                    const graph = readInstalled(dir);
                    if (opts.flat) return void process.stdout.write(renderFlat(graph));
                    if (!graph.root.length) return void console.log('This project has no dependencies.');
                    process.stdout.write(graph.root.map((cid) => renderTree(graph, cid)).join('\n'));
                }),
            ),
};

export function projectCommand(): Command {
    const project = new Command('project').description(
        'Manage the project in the current directory (or -C <dir>): its dpm.json and its installed dependencies',
    );
    for (const make of Object.values(projectCommands)) project.addCommand(make());
    return project;
}
