import { Command } from 'commander';
import { VERSION } from '../version';
import { nodeCommand } from './commands/node';
import { packageCommand } from './commands/package';
import { projectCommand, projectCommands } from './commands/project';

/**
 * `dpm`: the DPM client, organised as APM's was: commands grouped by what they act on, with shorthands for the
 * common ones.
 *
 *   dpm project <command>       the project in the current directory: init, install, pack, dep, tree
 *   dpm project dep <command>   its direct dependencies: add, remove, ls
 *   dpm package <command>       a package, by CID: tree
 *   dpm node <command>          which Kubo dpm reads through: show, set, reset
 *
 * Every `dpm project` command also works as a shorthand: `dpm install` is `dpm project install`, and `dpm dep`
 * is `dpm project dep`, with all its subcommands (`dpm dep add`). Each is built by the same function in both
 * places, so they can't differ.
 *
 * `dpm` only reads from IPFS (see docs/ipfs.md). Kubo's `ipfs` command does the rest:
 *
 *   ipfs add -r -Q "$(dpm pack)"                         add a package to your node
 *   dpm package tree <cid> --flat | ipfs pin add         pin a package and its whole tree
 *   ipfs pin remote add --service=<server> <cid>         push a package to a server (any IPFS pinning service)
 *   ipfs swarm peering add <server address>              stay connected to a server, to fetch from it
 */
export function program(): Command {
    const dpm = new Command()
        .name('dpm')
        .version(VERSION)
        .description(
            'Distributed Package Manager: folders identified by their IPFS CID, depending on each other by CID',
        )
        .option('-C, --dir <dir>', 'the project directory', '.');

    dpm.addCommand(projectCommand());
    dpm.addCommand(packageCommand());
    dpm.addCommand(nodeCommand());

    // Shorthands: `dpm <name>` is `dpm project <name>`, including the `dep` group with its subcommands.
    for (const [name, make] of Object.entries(projectCommands)) {
        const shorthand = make();
        dpm.addCommand(shorthand.description(`(dpm project ${name}) ${shorthand.description()}`));
    }
    return dpm;
}
