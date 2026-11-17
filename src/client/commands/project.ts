import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { DEPS, DpmError, install, MANIFEST, readInstalled, readManifest, writeManifest } from '../../core';
import { pack } from '../client';
import { ClientConfig } from '../config';
import { renderFlat, renderTree } from '../render';
import { depCommand } from './dep';
import { run, TIMEOUT } from './run';

/**
 * `dpm project ...`: commands on the project in the current directory (or `-C <dir>`). Each command is built by
 * one function, used both for `dpm project <name>` and for its shorthand `dpm <name>` (see program.ts). That
 * includes `dep`, the group of commands on the project's direct dependencies: `dpm project dep add` is also
 * `dpm dep add`.
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

    clean: () =>
        new Command('clean')
            .description(
                "Delete the project's deps/ folder: everything dpm install wrote. Nothing in IPFS is touched; " +
                    'dpm install brings it all back.',
            )
            .action(
                run((dir) => {
                    readManifest(dir); // only in a DPM project: never another folder's deps/
                    const deps = path.join(dir, DEPS);
                    if (!fs.existsSync(deps)) return void console.log('nothing to clean: no deps/ folder');
                    fs.rmSync(deps, { recursive: true, force: true });
                    console.log(`deleted ${deps}`);
                }),
            ),

    pack: () =>
        new Command('pack')
            .description(
                "Add the project's package to your Kubo, which pins it, and print its CID: everything except deps/ " +
                    'and hidden files. Push it with: ipfs pin remote add --service=<server> "$(dpm pack)"',
            )
            .action(run(async (dir) => console.log(await pack(dir, ClientConfig.load().kubo())))),

    dep: depCommand,

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
        'The project in the current directory (or -C <dir>): create it, manage its direct dependencies, install them, pack it, draw its tree',
    );
    for (const make of Object.values(projectCommands)) project.addCommand(make());
    return project;
}
