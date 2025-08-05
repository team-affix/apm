import { Command, Option } from 'commander';
import { debug } from 'debug';
import * as common from '@team-affix/apm-common';
import { createTrpcClient } from '../trpc/client';
import { getAPIUrl, getHealthUrl, Remotes } from '../models/remotes';
import path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { pull } from '../utils/pull';
import { healthCheck } from '../utils/health-check';
import { version as VERSION } from '../../package.json';
import { push } from '../utils/push';

export const initCommand = new Command()
    .name('init')
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

export const installCommand = new Command()
    .name('install')
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

export const cleanCommand = new Command()
    .name('clean')
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

export const checkCommand = new Command()
    .name('check')
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

export const packCommand = new Command()
    .name('pack')
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

export const unpackCommand = new Command()
    .name('unpack')
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

export const treeCommand = new Command()
    .name('tree')
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

export const projectCommand = new Command()
    .name('project')
    .description('Manages the current project')
    .addCommand(initCommand)
    .addCommand(installCommand)
    .addCommand(cleanCommand)
    .addCommand(checkCommand)
    .addCommand(packCommand)
    .addCommand(unpackCommand)
    .addCommand(treeCommand);
