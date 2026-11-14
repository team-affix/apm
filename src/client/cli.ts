#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { assertCid, DEPS, DpmError, readGraph, readManifest, writeManifest } from '../core';
import { VERSION } from '../version';
import { ClientConfig } from './config';
import { cidOf, installProject, pack, remoteNode, status, tree } from './client';

/**
 * `dpm`: the DPM client. Packages are folders with a `dpm.json`, identified by their IPFS CID; `dpm.json` lists
 * the CIDs a package depends on.
 *
 * `dpm` does package management and only reads from IPFS. Every change to what a node keeps (adding, pinning,
 * pushing to a server) is made with the `ipfs` command:
 *
 *   ipfs add -r -Q "$(dpm pack)"                              add a package to your node
 *   dpm tree <cid> | xargs -n1 ipfs pin add                   pin a package and its whole tree
 *   ipfs pin remote add --service=<server> <cid>              push a package to a DPM server
 */
const program = new Command()
    .name('dpm')
    .version(VERSION)
    .description('Decentralized Package Manager: folders identified by their IPFS CID, depending on each other by CID')
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
    .option('-r, --remote <name...>', 'remotes to ask for packages (default: all)')
    .option('--timeout <duration>', 'how long fetching one package may take, e.g. 60s', '120s')
    .action(
        run(async (opts: { remote?: string[]; timeout: string }) => {
            const config = ClientConfig.load();
            const graph = await installProject(dir(), config.kubo(opts.timeout), config.select(opts.remote));
            const n = Object.keys(graph.packages).length;
            console.log(`installed ${n} package${n === 1 ? '' : 's'} into ${path.join(dir(), DEPS)}`);
        }),
    );

program
    .command('pack')
    .description(
        'Write the project\'s package (everything except deps/ and hidden files) to a temporary folder and print the folder. Add it with: ipfs add -r -Q "$(dpm pack)"',
    )
    .action(
        run(async () => {
            const { folder, cid } = await pack(dir(), ClientConfig.load().kubo());
            console.log(folder);
            console.error(`CID once added to IPFS: ${cid}`);
        }),
    );

program
    .command('cid')
    .description("Print the project's CID, without storing anything")
    .action(run(async () => console.log(await cidOf(dir(), ClientConfig.load().kubo()))));

program
    .command('tree')
    .description(
        'Print a package and every package it depends on, recursively, one CID per line. To pin them all: dpm tree <cid> | xargs -n1 ipfs pin add',
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
    .option('--node', 'instead, list every DPM package pinned in the local IPFS node')
    .option('--remote <name>', 'instead, list every DPM package a remote DPM server keeps')
    .action(
        run(async (opts: { node?: boolean; remote?: string }) => {
            if (opts.node || opts.remote) {
                const config = ClientConfig.load();
                const [remote] = opts.remote ? config.select([opts.remote]) : [];
                // A DPM server's pin/ls already lists only DPM packages; a local node's pins are filtered here.
                const cids = remote ? await remoteNode(remote).pins() : await config.kubo().packages();
                for (const cid of cids) console.log(cid);
                return;
            }
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

program
    .command('status')
    .description('Show what each remote decided about a package you pushed, with its reason if it refused it')
    .argument('<cid>')
    .option('-r, --remote <name...>', 'remotes to ask (default: all)')
    .action(
        run(async (cid: string, opts: { remote?: string[] }) => {
            for (const r of await status(assertCid(cid), ClientConfig.load().select(opts.remote))) {
                const reason = r.status?.info?.reason;
                console.log(`${r.remote}: ${r.status?.status ?? 'no request'}${reason ? `: ${reason}` : ''}`);
            }
        }),
    );

const remote = program
    .command('remote')
    .description('Manage the DPM servers dpm reads from (to push to one, use ipfs pin remote add)');

remote
    .command('add')
    .argument('<name>')
    .argument('<url>')
    .action(
        run((name: string, url: string) => {
            const config = ClientConfig.load();
            config.addRemote({ name, url });
            config.save();
        }),
    );

remote
    .command('remove')
    .argument('<name>')
    .action(
        run((name: string) => {
            const config = ClientConfig.load();
            config.removeRemote(name);
            config.save();
        }),
    );

remote.command('ls').action(
    run(() =>
        ClientConfig.load()
            .remotes()
            .forEach((r) => console.log(`${r.name}\t${r.url}`)),
    ),
);

program
    .command('node')
    .description('Show the local IPFS node, or set where its RPC API is')
    .option('--set <url>', 'set the RPC API URL (default http://127.0.0.1:5001)')
    .action(
        run(async (opts: { set?: string }) => {
            const config = ClientConfig.load();
            if (opts.set) {
                config.setKubo(opts.set);
                config.save();
            }
            const kubo = config.kubo();
            const id = await kubo.id();
            console.log(`Kubo ${await kubo.version()} at ${kubo.api}`);
            console.log(`peer ID ${id.id}`);
            id.addresses.forEach((a) => console.log(`  ${a}`));
        }),
    );

program.parseAsync().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
});
