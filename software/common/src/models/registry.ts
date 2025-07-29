import fs from 'fs';
import debug from 'debug';
import path from 'path';
import os from 'os';
import { Package } from './package';
import { PackageTree } from '../utils/package-tree';
import { Project } from './project';
import RegistryLoadError from '../errors/registry-load';
import RegistryCreateError from '../errors/registry-create';
import GetProjectTreeError from '../errors/get-project-tree';
import VetPackageError from '../errors/vet-package';
import PutPackageError from '../errors/put-package';

// The name of the packages directory
const PACKAGES_DIR_NAME = 'packages';

// Get the path to a package
function getPackagePath(cwd: string, id: string): string {
    return path.join(cwd, PACKAGES_DIR_NAME, `${id}.apm`);
}

// Registry model
class Registry {
    // Constructs a registry model given the root path
    private constructor(public readonly cwd: string) {}

    // Load a registry from the given directory
    static async load(cwd: string): Promise<Registry> {
        // if the path does not exist or is a file, throw an error
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory())
            throw new RegistryLoadError(cwd, 'Path does not exist or is not a directory');

        // If the packages directory does not exist, throw an error
        if (!fs.existsSync(path.join(cwd, PACKAGES_DIR_NAME)))
            throw new RegistryLoadError(cwd, 'Packages directory does not exist');

        // Return the registry
        return new Registry(cwd);
    }

    // Create a registry in the given directory
    static async create(cwd: string): Promise<Registry> {
        // If the directory exists, throw an error
        if (fs.existsSync(cwd)) throw new RegistryCreateError(cwd, 'Path already exists');

        // Create the directory
        fs.mkdirSync(cwd, { recursive: true });

        // Create the packages directory
        fs.mkdirSync(path.join(cwd, PACKAGES_DIR_NAME), { recursive: true });

        // Return the registry
        return await Registry.load(cwd);
    }

    // Get the default registry
    static async getDefault(): Promise<Registry> {
        // Create the default registry path
        const defaultRegistryPath = path.join(os.homedir(), '.apm', 'common', 'registry');

        // If the default registry path does not exist, create it
        if (!fs.existsSync(defaultRegistryPath)) return await Registry.create(defaultRegistryPath);

        // Return the default registry
        return await Registry.load(defaultRegistryPath);
    }

    // Get a package from the registry
    async get(id: string): Promise<Package> {
        // Get the debugger
        const dbg = debug('apm:common:models:Registry:getPackage');

        // Indicate that we are getting a package
        dbg(`Getting package ${id}`);

        // Get the path to the package
        const filePath = getPackagePath(this.cwd, id);

        // Indicate the file path
        dbg(`File path: ${filePath}`);

        // Return the package
        return await Package.load(filePath);
    }

    // Gets a package tree, which includes the package itself and all of its dependencies
    // It also includes dependencies which are overridden.
    // The order of the result is a valid topological sort of the package tree.
    async getPackageTree(id: string, visitedIds: Set<string> = new Set<string>()): Promise<PackageTree> {
        // Get the debugger
        const dbg = debug('apm:common:models:Registry:getPackageTree');

        // Indicate that we are getting the package tree
        dbg(`Getting package tree for ${id}`);

        // Get the package
        const pkg = await this.get(id);

        // Get the dependencies of the package
        const deps = pkg.directDeps;

        // Get the package tree of the dependencies
        const subTrees: PackageTree[] = [];

        // Add each dependency to the result if it has not been visited
        for (const depId of deps) {
            // If the dependency has been visited, skip it
            if (visitedIds.has(depId)) continue;

            // Push the id to the visited set
            visitedIds.add(depId);

            // Visit the child package
            const subTree = await this.getPackageTree(depId, visitedIds);

            // Add the package tree to the result
            subTrees.push(subTree);
        }

        // Return the package tree
        return new PackageTree(pkg, subTrees);
    }

    // Get the project tree of a project given its direct dependencies
    async getProjectTree(
        directDeps: Set<string>,
        overrideNames: Set<string> = new Set<string>(),
        visitedNames: Set<string> = new Set<string>(),
    ): Promise<PackageTree[]> {
        // Get the debugger
        const dbg = debug('apm:common:models:Registry:getProjectTree');

        // Indicate that we are getting the project dependencies
        dbg(`Getting project tree given direct dependencies: ${JSON.stringify(Array.from(directDeps))}`);

        // Get the packages
        const pkgs = new Map<string, Package>();
        for (const id of directDeps) {
            const pkg = await this.get(id);
            pkgs.set(id, pkg);
        }

        // Filter out the direct dependencies that are overridden
        for (const [id, pkg] of pkgs.entries()) {
            dbg(`Checking if ${pkg.name} is in overrides`);
            dbg(`Overrides: ${JSON.stringify(Array.from(overrideNames))}`);
            // If the package exists in overrides, pop it from directDeps
            // as it has been overridden.
            if (overrideNames.has(pkg.name)) pkgs.delete(id);
        }

        // Get the local package names
        const pkgNames = Array.from(pkgs.values()).map((pkg) => pkg.name);

        // Create a new set of overrides that includes the locally accepted overrides
        const localOverrides = new Set<string>([...overrideNames, ...pkgNames]);

        // Create a result array
        const result: PackageTree[] = [];

        // Visit each of the direct dependencies and recur on their dependencies
        for (const [id, pkg] of pkgs.entries()) {
            // Check if the package is in visitedNames
            dbg(`Checking if ${pkg.name} is in visitedNames`);

            // Print the visited names
            dbg(`visitedNames: ${JSON.stringify(Array.from(visitedNames))}`);

            // If the package exists in visitedNames, throw an error
            // as this is an unresolved peer dependency.
            if (visitedNames.has(pkg.name))
                throw new GetProjectTreeError(id, `Unresolved peer dependency: ${pkg.name}`);

            // Get the dependencies of the package
            const deps = pkg.directDeps;

            // Recur on the dependencies of this package
            const subResult = await this.getProjectTree(deps, localOverrides, visitedNames);

            // Add the package to the results
            const tree = new PackageTree(pkg, subResult);

            // Add the package to the result
            result.push(tree);

            // Indicate that we have added pkg and its project tree to the result
            dbg(`Added ${pkg.name}@${id} and its project tree to the result`);

            // Add the package to the visited set
            visitedNames.add(pkg.name);

            // Indicate that we have visited the package
            dbg(`Added ${pkg.name} to visitedNames`);
        }

        // Print the result
        dbg(`Result: ${result.map((tree) => tree.toString()).join('\n')}`);

        // Return the result
        return result;
    }

    // Vet a package
    async vet(pkg: Package, expectedId?: string): Promise<void> {
        // Get the debugger
        const dbg = debug('apm:common:models:Registry:vet');

        // Indicate that we are vetting a package
        dbg(`Vetting package ${pkg.name}@${pkg.id}`);

        // Check if the package id matches the expected id
        if (expectedId && pkg.id !== expectedId)
            throw new VetPackageError(
                pkg.name,
                pkg.id,
                `Package id does not match expected id. Expected: ${expectedId}`,
            );

        // Create a project folder
        const projectDirPath = fs.mkdtempSync(path.join(os.tmpdir(), `apm-vet-${pkg.name}-${pkg.id}`));

        // Create a project from the package in a temporary directory
        const project = await Project.init(projectDirPath, { pkg });

        // Check for any illegal files (anything with an extension other than .agda or .md) within the root source
        if (project.rootSource.miscFiles.length > 0)
            throw new VetPackageError(
                pkg.name,
                pkg.id,
                `Package contains illegal files:\n${project.rootSource.miscFiles.join('\n')}`,
            );

        // Get the project tree
        const projectTree = await this.getProjectTree(pkg.directDeps);

        // Get the topological sort of the project tree
        const pkgs = projectTree.flatMap((pkgTree) => pkgTree.getTopologicalSort());

        // Install the project
        await project.install(pkgs);

        // Check the project
        await project.check();
    }

    // Add a package to the registry
    async put(pkg: Package, expectedId?: string): Promise<void> {
        // Get the debugger
        const dbg = debug('apm:common:models:Registry:put');

        // Indicate that we are putting a package
        dbg(`Putting package ${pkg.name}@${pkg.id}`);

        // Get the path to the package
        const dest = getPackagePath(this.cwd, pkg.id);

        // Error if the package is already registered
        if (fs.existsSync(dest)) throw new PutPackageError(pkg.name, pkg.id, 'Package already registered');

        // Vet the package
        await this.vet(pkg, expectedId);

        // Create the directory for the package
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        // Write the package to the registry
        fs.copyFileSync(pkg.filePath, dest);
    }

    // List all packages in the registry
    async ls(pkgIds: Set<string>): Promise<Set<string>> {
        // Get the debugger
        const dbg = debug('apm:common:models:Registry:ls');

        // Indicate that we are listing packages
        dbg(`Listing packages`);

        // Create a result set
        const result = new Set<string>();

        // For each package, add it to the result
        for (const id of pkgIds) {
            // Get the path to the package
            const dest = getPackagePath(this.cwd, id);

            // If the package does not exist, skip it
            if (!fs.existsSync(dest)) continue;

            // Add the package to the result
            result.add(id);
        }

        // Return the result
        return result;
    }
}

export { Registry };

export const __test__ = {
    getPackagePath,
};
