#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { assertCid, DEPS, DpmError, install, readGraph, readManifest, writeManifest } from '../core';
import { VERSION } from '../version';
import { ClientConfig } from './config';
import { pack, tree } from './client';

/**
 * `dpm`: the DPM client. Packages are folders with a `dpm.json`, identified by their IPFS CID; `dpm.json` lists
 * the CIDs a package depends on.
 *
 * `dpm` does package management. It talks to one Kubo node, normally the one running on this machine, and only reads from it
 * (see docs/ipfs.md). Kubo does everything else: adding, pinning, and every exchange with other machines, servers
 * included:
 *
 *   ipfs add -r -Q "$(dpm pack)"                    add a package to your node
 *   dpm tree <cid> | ipfs pin add                   pin a package and its whole tree
 *   ipfs pin remote add --service=<server> <cid>    push a package to a server (any IPFS pinning service)
 *   ipfs swarm peering add <server address>         stay connected to a server, to fetch from it
 */
const program = new Command()
    .name('dpm')
    .version(VERSION)
    .description('Distributed Package Manager: folders identified by their IPFS CID, depending on each other by CID')
    .option('-C, --dir <dir>', 'the project directory', '.');

const dir = () => path.resolve((program.opts() as { dir: string }).dir);

/** Runs a command action, printing DPM errors without a stack trace. */
function run<A extends unknown[]>(action: (...args: A) => Promise<void> | void) {
    return async (...args: A) => {
        try {
            await action(...args);
        } catch (e) {
            if (!(e instanceof DpmError)) throw e;
            console.error(e.message);
            process.exitCode = 1;
        }
    };
}

program
    .command('init')
    .description('Make the project directory a DPM package: create its dpm.json')
    .action(
        run(() => {
            if (fs.existsSync(path.join(dir(), 'dpm.json'))) throw new DpmError('dpm.json already exists');
            writeManifest(dir(), { deps: [] });
            console.log(`created ${path.join(dir(), 'dpm.json')}`);
        }),
    );

program
    .command('add')
    .description("Add direct dependencies to the project's dpm.json, by CID")
    .argument('<cid...>')
    .action(
        run((cids: string[]) => {
            const m = readManifest(dir());
            writeManifest(dir(), { deps: [...m.deps, ...cids.map(assertCid)] });
        }),
    );

program
    .command('remove')
    .description("Remove direct dependencies from the project's dpm.json")
    .argument('<cid...>')
    .action(
        run((cids: string[]) => {
            const m = readManifest(dir());
            const missing = cids.filter((c) => !m.deps.includes(c));
            if (missing.length) throw new DpmError(`Not a dependency: ${missing.join(', ')}`);
            writeManifest(dir(), { deps: m.deps.filter((d) => !cids.includes(d)) });
        }),
    );

program
    .command('install')
    .description(
        'Fetch every dependency, by CID, into deps/<cid>/, and write deps/graph.json. Nothing is pinned: fetched data is only cached.',
    )
    .option('--timeout <duration>', 'how long fetching one package may take, e.g. 60s', '120s')
    .action(
        run(async (opts: { timeout: string }) => {
            const graph = await install(dir(), ClientConfig.load().kubo(opts.timeout));
            const n = Object.keys(graph.packages).length;
            console.log(`installed ${n} package${n === 1 ? '' : 's'} into ${path.join(dir(), DEPS)}`);
        }),
    );

program
    .command('pack')
    .description(
        'Write the project\'s package (everything except deps/ and hidden files) to a new folder, and print the folder. Without -o, it is a temporary folder named by a random GUID. Add it with: ipfs add -r -Q "$(dpm pack)"',
    )
    .option('-o, --out <folder>', 'write the package to this new folder instead')
    .action(run((opts: { out?: string }) => console.log(pack(dir(), opts.out))));

program
    .command('tree')
    .description(
        'Print a package and every package it depends on, recursively, one CID per line. To pin them all: dpm tree <cid> | ipfs pin add',
    )
    .argument('<cid>')
    .option('--timeout <duration>', 'how long fetching one package may take, e.g. 60s', '120s')
    .action(
        run(async (cid: string, opts: { timeout: string }) => {
            for (const c of await tree(assertCid(cid), ClientConfig.load().kubo(opts.timeout))) console.log(c);
        }),
    );

program
    .command('ls')
    .description("List the project's installed packages, with what each contains at its top level")
    .action(
        run(() => {
            const graph = readGraph(dir());
            if (!graph) throw new DpmError("Nothing installed: run 'dpm install'");
            for (const [cid, { deps }] of Object.entries(graph.packages)) {
                const top = fs
                    .readdirSync(path.join(dir(), DEPS, cid))
                    .filter((n) => n !== 'dpm.json')
                    .join(', ');
                const direct = graph.root.includes(cid) ? '*' : ' ';
                console.log(`${direct} ${cid}  ${top || '(empty)'}${deps.length ? `  (${deps.length} deps)` : ''}`);
            }
        }),
    );

const node = program
    .command('node')
    .description('Which Kubo dpm reads through: by default the one running on this machine (http://127.0.0.1:5001)');

/** Prints the Kubo dpm uses, and its version (which also shows that dpm can reach it). */
async function showNode(config: ClientConfig) {
    const kubo = config.kubo();
    console.log(`Kubo ${await kubo.version()} at ${kubo.api}`);
}

/** After saving a setting: shows the Kubo, or says it's saved but not reachable yet (e.g. not started). */
async function showSaved(config: ClientConfig) {
    try {
        await showNode(config);
    } catch (e) {
        if (!(e instanceof DpmError)) throw e;
        const kubo = config.kubo();
        console.log(`dpm will use the Kubo at ${kubo.api}, but can't reach it yet: ${e.message}`);
    }
}

node.command('show', { isDefault: true })
    .description('Show which Kubo dpm reads through, and its version (the default for `dpm node`)')
    .action(run(() => showNode(ClientConfig.load())));

node.command('set')
    .description('Set the URL of the Kubo HTTP API dpm reads through, and its secret if it requires one')
    .argument('<url>', "the Kubo node's HTTP API, e.g. http://192.168.0.5:5001")
    .argument('[secret]', 'the secret, as Kubo writes them: bearer:<token> or basic:<user>:<password>')
    .action(
        run(async (url: string, secret?: string) => {
            const config = ClientConfig.load();
            config.setKubo(url, secret);
            config.save();
            await showSaved(config);
        }),
    );

node.command('reset')
    .description('Go back to the default: the Kubo running on this machine (http://127.0.0.1:5001)')
    .action(
        run(async () => {
            const config = ClientConfig.load();
            config.resetKubo();
            config.save();
            await showSaved(config);
        }),
    );

program.parseAsync().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
});
