import { Command, Option } from 'commander';
import { debug } from 'debug';
import * as common from '@team-affix/apm-common';
import { createTrpcClient } from '../trpc/client';
import { Remotes } from '../models/remotes';
import path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { pull } from '../utils/pull';

// Set version manually (can be updated during build)
const VERSION = '1.4.4';

// Create a new commander program
export const program = new Command();

// Configure the program with version, description, etc.
program.name('apm').description('Agda Package Manager - A tool for managing Agda packages').version(VERSION);

// Create a new command group for project management
const projectCommand = program.command('project').description('Manages the current project');

// Create a new command group for remote management
const remoteCommand = program.command('remote').description("Manages the client's remotes file");

// Create a new command group for package management
const packageCommand = program.command('package').description('Manages packages');

// program
//   .command("clean")
//   .description("Cleans the virtual environment of all non-root packages")
//   .action(() => {
//     if (!cwd_is_root_package()) {
//       console.error(
//         "Error: This command must be run from the root package of an apm environment"
//       );
//       process.exit(1);
//     }

//     clean();
//   });

projectCommand
    .command('init')
    .description('Initializes an apm project in the current directory')
    .argument('<project-name>', 'The name of the project')
    .action(async (projectName: string) => {
        // Create debug logger
        const dbg = debug('apm:project:create');

        try {
            // Get the current working directory
            const cwd = process.cwd();
            // Create the project
            await common.Project.init(cwd, { projectName });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

projectCommand
    .command('install')
    .description('Installs the dependencies for the current project')
    .action(async () => {
        // Create debug logger
        const dbg = debug('apm:project:install');

        try {
            // Get the current working directory
            const cwd = process.cwd();

            dbg(`Installing project at ${cwd}`);

            // Get the project
            const project = await common.Project.load(cwd);

            // Get the default registry
            const registry = await common.Registry.getDefault();

            dbg(`Registry: ${registry.cwd}`);

            // Get the direct dependencies
            const deps = project.directDeps;

            // Get the transitive dependencies
            const overrides = new Set<string>();
            const visited = new Set<string>();
            const pkgTrees: common.PackageTree[] = await registry.getProjectTree(deps, overrides, visited);

            dbg(`PackageTrees: ${JSON.stringify(pkgTrees.map((pkgTree) => pkgTree.toString()))}`);

            // Get the topological sort of the package trees
            const pkgs = pkgTrees.flatMap((pkgTree) => pkgTree.getTopologicalSort());

            dbg(`Packages: ${JSON.stringify(pkgs.map((pkg) => pkg.name))}`);

            // Install the dependencies
            await project.install(pkgs);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

projectCommand
    .command('clean')
    .description('Cleans the current project')
    .action(async () => {
        try {
            // Get the current working directory
            const cwd = process.cwd();
            // Get the project
            const project = await common.Project.load(cwd);
            // Clean the project
            await project.clean();
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

projectCommand
    .command('check')
    .description('Typechecks the current project')
    .action(async () => {
        try {
            // Get the current working directory
            const cwd = process.cwd();

            // Get the project
            const project = await common.Project.load(cwd);

            // Typecheck the project
            await project.check();
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

projectCommand
    .command('pack')
    .description('Packs the current project into an apm file')
    .argument('<destination>', 'The destination path for the package')
    .action(async (destination: string) => {
        // Create debug logger
        const dbg = debug('apm:project:pack');

        try {
            // Get the current working directory
            const cwd = process.cwd();
            // Get the project
            const project = await common.Project.load(cwd);
            // Pack the project
            const archive = await project.rootSource.getArchive();
            // Construct package with archive
            const pkg = await common.Package.create(destination, project.name, project.directDeps, archive);
            // Write the package to the current working directory
            console.log(`Package created: ${pkg.id}`);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

projectCommand
    .command('unpack')
    .description('Unpacks an apm file into a project in the current directory')
    .argument('<source>', 'The source path for the apm file')
    .action(async (source: string) => {
        // Create debug logger
        const dbg = debug('apm:project:unpack');

        try {
            // Get the current working directory
            const cwd = process.cwd();
            // Load the package
            const pkg = await common.Package.load(source);
            // Unpack the package
            await common.Project.init(cwd, { pkg });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

projectCommand
    .command('tree')
    .description('Prints the dependency tree of the current project')
    .action(async () => {
        // Create debug logger
        const dbg = debug('apm:project:tree');

        try {
            // Get the current working directory
            const cwd = process.cwd();
            // Get the project
            const project = await common.Project.load(cwd);
            // Get the default registry
            const registry = await common.Registry.getDefault();
            // Get the direct dependencies
            const deps = project.directDeps;
            // Get the Package Trees
            const pkgTrees = await registry.getProjectTree(deps);
            // Print the dependency tree
            console.log(pkgTrees.map((pkgTree) => pkgTree.toString()).join('\n'));
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
        }
    });

packageCommand
    .command('register')
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

packageCommand
    .command('info')
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

remoteCommand
    .command('ls')
    .description('Lists the remotes in the remotes file')
    .action(async () => {
        const remotes = Remotes.getDefault();
        console.log(remotes.toString());
    });

remoteCommand
    .command('add')
    .description('Adds a remote to the remotes file')
    .argument('<name>', 'The name of the remote')
    .argument('<url>', 'The url of the remote')
    .action(async (name: string, url: string) => {
        try {
            const remotes = Remotes.getDefault();
            remotes.add(name, url);
            remotes.save();
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

remoteCommand
    .command('rm')
    .description('Removes a remote from the remotes file')
    .argument('<name>', 'The name of the remote')
    .action(async (name: string) => {
        try {
            const remotes = Remotes.getDefault();
            remotes.remove(name);
            remotes.save();
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

packageCommand
    .command('ls')
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
                // Get the remote URL
                const remotes = Remotes.getDefault();
                const url = remotes.get(options.remote);

                // Create a TRPC client
                const trpcClient = createTrpcClient(url);

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

packageCommand
    .command('pull')
    .description('Pulls a package and registers it in the local registry')
    .argument('<remote>', 'The remote to pull from')
    .argument('<id>', 'The id of the package to pull')
    .action(async (remote: string, id: string) => {
        try {
            await pull(remote, id);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });
