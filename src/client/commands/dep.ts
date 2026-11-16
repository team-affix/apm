import { Command } from 'commander';
import { assertCid, DpmError, readManifest, writeManifest } from '../../core';
import { run } from './run';

/**
 * `dpm project dep ...` (shorthand `dpm dep ...`): the project's direct dependencies, as listed in its dpm.json
 * (in the current directory, or `-C <dir>`).
 */
export const depCommands = {
    add: () =>
        new Command('add')
            .description("Add direct dependencies to the project's dpm.json, by CID")
            .argument('<cid...>')
            .action(
                run((dir, cids: string[]) => {
                    writeManifest(dir, { deps: [...readManifest(dir).deps, ...cids.map(assertCid)] });
                }),
            ),

    rm: () =>
        new Command('rm')
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

    ls: () =>
        new Command('ls')
            .description(
                "List the project's direct dependencies, one CID per line, from its dpm.json (only those it lists " +
                    'itself; the whole installed tree is dpm tree)',
            )
            .action(
                run((dir) => {
                    for (const cid of readManifest(dir).deps) console.log(cid);
                }),
            ),
};

/** The `dep` group: one of the project commands, so `dpm dep` is its shorthand like any other (see project.ts). */
export function depCommand(): Command {
    const dep = new Command('dep').description("The project's direct dependencies, listed in its dpm.json");
    for (const make of Object.values(depCommands)) dep.addCommand(make());
    return dep;
}
