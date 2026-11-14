#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { assertCid, DEPS, DpmError, readGraph, readManifest, writeManifest } from '../core';
import { VERSION } from '../version';
import { ClientConfig } from './config';
import { cidOf, installProject, pack, push, remoteNode } from './client';

/**
 * `dpm`: the DPM client. Packages are folders identified by their IPFS CID; a project's `dpm.json` lists the
 * CIDs it depends on. Content lives in the local IPFS node (Kubo), which `dpm` drives through its RPC API.
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
    .description('Create dpm.json in the project directory')
    .action(
        run(() => {
            if (fs.existsSync(path.join(dir(), 'dpm.json'))) throw new DpmError('dpm.json already exists');
            writeManifest(dir(), { deps: [] });
            console.log(`created ${path.join(dir(), 'dpm.json')}`);
        }),
    );

program
    .command('add')
    .description('Add direct dependencies, by CID')
    .argument('<cid...>')
    .action(
        run((cids: string[]) => {
            const m = readManifest(dir());
            writeManifest(dir(), { deps: [...m.deps, ...cids.map(assertCid)] });
        }),
    );

program
    .command('remove')
    .description('Remove direct dependencies')
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
    .description('Fetch every dependency, by CID, into deps/<cid>/, and write deps/graph.json')
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
    .command('cid')
    .description("Print the project's CID, without storing anything")
    .action(run(async () => console.log(await cidOf(dir(), ClientConfig.load().kubo()))));

program
    .command('pack')
    .description('Add the project to the local IPFS node (leaving out deps/ and hidden files) and print its CID')
    .action(run(async () => console.log(await pack(dir(), ClientConfig.load().kubo()))));

program
    .command('push')
    .description(
        'Pack the project (or take a CID) and ask remotes to keep it. Nothing is uploaded: they fetch it from your IPFS node.',
    )
    .argument('[remote...]', 'remotes to push to (default: all)')
    .option('--cid <cid>', 'push this CID instead of packing the project')
    .option('--wait <seconds>', 'how long to wait for each remote', '120')
    .action(
        run(async (remotes: string[], opts: { cid?: string; wait: string }) => {
            const config = ClientConfig.load();
            const kubo = config.kubo();
            const targets = config.select(remotes);
            if (!targets.length) throw new DpmError("No remotes: add one with 'dpm remote add <name> <url>'");
            const cid = opts.cid ? assertCid(opts.cid) : await pack(dir(), kubo);
            console.log(cid);
            for (const r of await push(cid, targets, kubo, Number(opts.wait) * 1000)) {
                const reason = r.status.info?.reason;
                console.log(`${r.remote}: ${r.status.status}${reason ? `: ${reason}` : ''}`);
                if (r.status.status !== 'pinned') process.exitCode = 1;
            }
        }),
    );

program
    .command('ls')
    .description("List the project's installed packages, with what each contains at its top level")
    .option('--node', "instead, list every package in the local IPFS node (DPM's pins, not other applications')")
    .option('--remote <name>', 'instead, list every package a remote DPM server keeps')
    .action(
        run(async (opts: { node?: boolean; remote?: string }) => {
            if (opts.node || opts.remote) {
                const config = ClientConfig.load();
                const [remote] = opts.remote ? config.select([opts.remote]) : [];
                const node = remote ? remoteNode(remote) : config.kubo();
                for (const cid of await node.packages()) console.log(cid);
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

const remote = program.command('remote').description('Manage remote DPM servers (any IPFS pinning service works)');

remote
    .command('add')
    .argument('<name>')
    .argument('<url>')
    .option('--token <token>', 'access token, if the server requires one')
    .action(
        run((name: string, url: string, opts: { token?: string }) => {
            const config = ClientConfig.load();
            config.addRemote({ name, url, ...(opts.token && { token: opts.token }) });
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
