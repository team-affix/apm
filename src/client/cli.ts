#!/usr/bin/env node
import { Command } from 'commander';
import { CachingSource, DpmError, formatTree, MissingDependencyError, parseId, resolve } from '../core';
import { ClientHome } from './config';
import { Project } from './project';
import { pull, push } from './transfer';

const home = ClientHome.dpm();
const localRegistry = () => home.registry();

const program = new Command()
    .name('dpm')
    .description('Decentralized Package Manager: content-addressed packages across many registries');

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

/** Remotes used as dependency sources: the named ones, or all configured remotes. */
function sourceRemotes(names: string[] | undefined, offline = false) {
    if (offline) return [];
    const remotes = home.remotes();
    return names && names.length > 0 ? names.map((n) => remotes.get(n)) : remotes.all();
}

// ---- projects ----

program
    .command('init')
    .description('Create dpm.json and a source directory in the current directory')
    .argument('<name>', 'package name')
    .action(
        run((name: string) => {
            Project.init(process.cwd(), name);
            console.log(`Initialized ${name}. Put content in ./${name}/`);
        }),
    );

program
    .command('add')
    .description('Add direct dependencies (replacing any existing dependency with the same name)')
    .argument('<ids...>', 'package IDs')
    .action(
        run((ids: string[]) => {
            const project = Project.load(process.cwd());
            for (const id of ids) {
                const replaced = project.add(id);
                console.log(replaced ? `Replaced ${replaced} with ${id}` : `Added ${id}`);
            }
        }),
    );

program
    .command('remove')
    .description('Remove direct dependencies')
    .argument('<ids-or-names...>', 'package IDs or names')
    .action(run((items: string[]) => items.forEach((i) => Project.load(process.cwd()).remove(i))));

program
    .command('install')
    .description('Resolve dependencies and write them to ./deps/<name>/')
    .option('-r, --remote <names...>', 'remotes to fetch missing packages from (default: all)')
    .option('--offline', 'use only the local registry')
    .action(
        run(async (opts: { remote?: string[]; offline?: boolean }) => {
            const project = Project.load(process.cwd());
            const resolution = await project.install(localRegistry(), sourceRemotes(opts.remote, opts.offline));
            console.log(formatTree(resolution));
            console.log(`Installed ${resolution.packages.length} package(s) into ./deps`);
        }),
    );

program
    .command('pack')
    .description('Build a package from the project and store it in the local registry')
    .option('-r, --remote <names...>', 'remotes to look up dependencies in (default: all)')
    .option('--offline', 'use only the local registry')
    .action(
        run(async (opts: { remote?: string[]; offline?: boolean }) => {
            const pkg = await Project.load(process.cwd()).pack(
                localRegistry(),
                sourceRemotes(opts.remote, opts.offline),
            );
            console.log(pkg.id);
        }),
    );

// ---- packages ----

program
    .command('ls')
    .description('List packages in the local registry or a remote (or check which of the given IDs are present)')
    .argument('[ids...]', 'IDs to check')
    .option('-r, --remote <name>', 'query a remote instead of the local registry')
    .action(
        run(async (ids: string[], opts: { remote?: string }) => {
            const source = opts.remote ? home.remotes().get(opts.remote) : localRegistry();
            const found = ids.length > 0 ? [...(await source.has(ids))] : await source.list();
            if (found.length > 0) console.log(found.join('\n'));
        }),
    );

program
    .command('info')
    .description('Show a package from the local registry')
    .argument('<id>')
    .action(
        run(async (id: string) => {
            parseId(id);
            const pkg = await localRegistry().get(id);
            if (!pkg) throw new MissingDependencyError([{ id, requiredBy: '(info)' }]);
            console.log(`id:      ${pkg.id}`);
            console.log(`name:    ${pkg.name}`);
            console.log(`deps:    ${pkg.deps.length === 0 ? '(none)' : pkg.deps.join('\n         ')}`);
            console.log(`payload: ${pkg.payload.length} bytes`);
        }),
    );

program
    .command('tree')
    .description("Show a package's resolved dependency tree")
    .argument('<id>')
    .option('-r, --remote <names...>', 'remotes to look up dependencies in (default: all)')
    .option('--offline', 'use only the local registry')
    .action(
        run(async (id: string, opts: { remote?: string[]; offline?: boolean }) => {
            parseId(id);
            const registry = localRegistry();
            const pkg = await registry.get(id);
            if (!pkg) throw new MissingDependencyError([{ id, requiredBy: '(tree)' }]);
            const sources = [registry, new CachingSource(sourceRemotes(opts.remote, opts.offline))];
            console.log(formatTree(await resolve(pkg, sources)));
        }),
    );

program
    .command('pull')
    .description('Fetch a package and its dependency tree into the local registry')
    .argument('<id>')
    .option('-r, --remote <names...>', 'remotes to pull from, in order (default: all)')
    .action(
        run(async (id: string, opts: { remote?: string[] }) => {
            const stored = await pull(localRegistry(), id, sourceRemotes(opts.remote));
            stored.forEach((p) => console.log(`Pulled ${p.id}`));
            if (stored.length === 0) console.log('Already up to date');
        }),
    );

program
    .command('push')
    .description('Push a package (and whatever of its tree the remote lacks) to a remote')
    .argument('<id>')
    .argument('<remote>')
    .option('-p, --provider <names...>', 'remotes the server may fetch missing dependencies from (default: all others)')
    .action(
        run(async (id: string, remoteName: string, opts: { provider?: string[] }) => {
            const remotes = home.remotes();
            const providers = opts.provider ? opts.provider.map((n) => remotes.get(n)) : remotes.all([remoteName]);
            const result = await push(localRegistry(), id, remotes.get(remoteName), providers);
            result.stored.forEach((s) => console.log(`Pushed ${s}`));
            if (result.stored.length === 0) console.log('Remote already has everything');
        }),
    );

// ---- remotes ----

const remote = program.command('remote').description('Manage remote registries (order = lookup priority)');

remote
    .command('add')
    .argument('<name>')
    .argument('<url>')
    .action(
        run((name: string, url: string) => {
            const remotes = home.remotes();
            remotes.add(name, url);
            remotes.save();
        }),
    );

remote
    .command('remove')
    .argument('<name>')
    .action(
        run((name: string) => {
            const remotes = home.remotes();
            remotes.remove(name);
            remotes.save();
        }),
    );

remote.command('ls').action(
    run(() =>
        home
            .remotes()
            .list()
            .forEach((r) => console.log(`${r.name}\t${r.url}`)),
    ),
);

remote
    .command('check')
    .description('Check that a remote is reachable')
    .argument('<name>')
    .action(
        run(async (name: string) => {
            await home.remotes().get(name).health();
            console.log('ok');
        }),
    );

program.parseAsync().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
});
