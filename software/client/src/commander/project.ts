import { Command } from 'commander';
import { debug } from 'debug';
import * as common from '@team-affix/apm-common';
import path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const initCommand = new Command()
    .name('init')
    .description('Initializes an apm project in the current directory')
    .argument('[project-name]', 'The name of the project. If not provided, --pkg must be used.')
    .option('-p, --pkg <pkg>', 'The root package to use')
    .action(async (projectName: string, options: { pkg?: string }) => {
        try {
            // Get the current working directory
            const cwd = process.cwd();

            let initArgs: { pkg: common.Package } | { projectName: string };

            // If --pkg is supplied AND project-name is provided, throw an error
            if (options.pkg && projectName) {
                console.error('Error: --pkg and [project-name] cannot be used together');
                process.exit(1);
            }

            // If a package is provided, use it as the root package
            if (options.pkg) {
                // Get the default registry
                const registry = await common.Registry.getDefault();
                // Get the package from the registry
                const pkg = await registry.get(options.pkg);
                // Set the init args
                initArgs = { pkg };
            } else if (projectName) {
                // Set the init args
                initArgs = { projectName };
            } else {
                console.error('Error: [project-name] is required if --pkg is not provided');
                process.exit(1);
            }

            // Create the project
            await common.Project.init(cwd, initArgs);
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
    .description('Packages the current project, and registers it locally')
    .action(async () => {
        try {
            // Get the current working directory
            const cwd = process.cwd();
            // Get the project
            const project = await common.Project.load(cwd);
            // Pack the project
            const archive = await project.rootSource.getArchive();
            // Create a file destination in temp directory
            const destination = path.join(os.tmpdir(), `apm-pkg-tmp-${project.name}.apm`);
            // If the destination file already exists, delete it
            if (fs.existsSync(destination)) fs.rmSync(destination);
            // Construct package with archive
            const pkg = await common.Package.create(destination, project.name, project.directDeps, archive);
            // Get the default registry
            const registry = await common.Registry.getDefault();
            // Register the package
            await registry.put(pkg);
            // Write the package ID to the terminal
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

export const treeCommand = new Command()
    .name('tree')
    .description('Prints the dependency tree of the current project')
    .action(async () => {
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
    .addCommand(treeCommand);
