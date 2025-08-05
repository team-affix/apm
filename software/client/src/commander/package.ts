import { Command, Option } from 'commander';
import { debug } from 'debug';
import * as common from '@team-affix/apm-common';
import { createTrpcClient } from '../trpc/client';
import { getAPIUrl, Remotes } from '../models/remotes';
import { pull } from '../utils/pull';
import { push } from '../utils/push';

export const registerCommand = new Command()
    .name('register')
    .description('Registers a package in the registry')
    .argument('<source>', 'The source path for the apm file')
    .argument('[id]', 'The expected id of the package, if one is known')
    .action(async (source: string, id?: string) => {
        // Create debug logger
        const dbg = debug('apm:project:register');

        try {
            // Load the package
            const pkg = await common.Package.load(source);
            // Get the default registry
            const registry = await common.Registry.getDefault();
            // Register the package
            await registry.put(pkg, id);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const infoCommand = new Command()
    .name('info')
    .description('Prints the details of the supplied package')
    .argument('<source>', 'The source path for the apm file')
    .action(async (source: string) => {
        // Create debug logger
        const dbg = debug('apm:project:stat');

        try {
            // Load the package
            const pkg = await common.Package.load(source);
            // Print the details
            console.log(`Package file: ${pkg.filePath}`);
            console.log(`Package name: ${pkg.name}`);
            console.log(`Package id: ${pkg.id}`);
            console.log(`Package dependencies: ${JSON.stringify(Array.from(pkg.directDeps))}`);
            console.log(`Package archive offset: ${pkg.archiveOffset}`);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
        }
    });

export const treeCommand = new Command()
    .name('tree')
    .description('Prints the dependency tree of the supplied package')
    .argument('<id>', 'The id of the package to print the tree of')
    .action(async (id: string) => {
        // Create debug logger
        const dbg = debug('apm:project:tree');

        try {
            // Get the default registry
            const registry = await common.Registry.getDefault();
            // Get the package tree
            const result = await registry.getPackageTree(id);
            // Print the dependency tree
            console.log(result.toString());
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const lsCommand = new Command()
    .name('ls')
    .description('Query the given package IDs')
    .addOption(new Option('-r, --remote <remote>', 'The remote to query').default(undefined))
    .argument('<ids...>', 'The ids to query')
    .action(async (ids: string[], options: { remote: string }) => {
        try {
            var result: string[] = [];

            // If no remote is specified, use the local registry
            if (options.remote === undefined) {
                // list the packages on the local registry, do not use https
                const registry = await common.Registry.getDefault();
                const resultSet = await registry.ls(new Set(ids));
                result = Array.from(resultSet);
            } else {
                // Get the remotes
                const remotes = Remotes.getDefault();

                // Get the server url
                const serverUrl = remotes.get(options.remote);

                // Get the api url
                const apiUrl = getAPIUrl(serverUrl);

                // Create a TRPC client
                const trpcClient = createTrpcClient(apiUrl);

                // Query the remote
                const resultObject = await trpcClient.ls.query({ ids: ids });
                result = resultObject.ids;
            }

            // Print the results
            console.log(result.join('\n'));
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const pullCommand = new Command()
    .name('pull')
    .description('Pulls a package and registers it in the local registry')
    .argument('<remote>', 'The remote to pull from')
    .argument('<id>', 'The id of the package to pull')
    .action(async (remote: string, id: string) => {
        try {
            // Get the remotes
            const remotes = Remotes.getDefault();

            // Get the server url
            const serverUrl = remotes.get(remote);

            // Get the api url
            const apiUrl = getAPIUrl(serverUrl);

            // Pull the package
            await pull(apiUrl, id);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const pushCommand = new Command()
    .name('push')
    .description('Pushes a package to the remote')
    .argument('<remote>', 'The remote to push to')
    .argument('<id>', 'The id of the package to push')
    .action(async (remote: string, id: string) => {
        try {
            // Get the remotes
            const remotes = Remotes.getDefault();

            // Get the server url
            const serverUrl = remotes.get(remote);

            // Get the api url
            const apiUrl = getAPIUrl(serverUrl);

            // Push the package
            await push(apiUrl, id);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const packageCommand = new Command()
    .name('package')
    .description('Manages packages')
    .addCommand(registerCommand)
    .addCommand(infoCommand)
    .addCommand(treeCommand)
    .addCommand(lsCommand)
    .addCommand(pullCommand)
    .addCommand(pushCommand);
