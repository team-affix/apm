#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { debug } from 'debug';
import * as common from '@team-affix/apm-common';
import { createTrpcClient } from './trpc-client';

// Set version manually (can be updated during build)
const VERSION = '1.0.0';

// Create a new commander program
const program = new Command();

// Configure the program with version, description, etc.
program.name('apm').description('Agda Package Manager - A tool for managing Agda packages').version(VERSION);

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

program
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

program
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
        }
    });

program
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
        }
    });

program
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
        }
    });

program
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
        }
    });

program
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
        }
    });

program
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
        }
    });

program
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

program
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

program
    .command('rpc-ls')
    .description('Tests the RPC calls')
    .argument('<url>', 'The url to test')
    .argument('<ids...>', 'The ids to test')
    .action(async (url: string, ids: string[]) => {
        const trpcClient = createTrpcClient(url);
        const result = await trpcClient.ls.query({ ids: ids });
        console.log(result);
    });

// Parse command line arguments
program.parse();

// If no command is provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
