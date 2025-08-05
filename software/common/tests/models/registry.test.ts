import path from 'path';
import os from 'os';
import fs from 'fs';
import debug from 'debug';
import tarFs from 'tar-fs';
import { expect, describe, it, beforeEach, beforeAll } from '@jest/globals';
import { Readable } from 'stream';
import { Registry, __test__ as RegistryTest } from '../../src/models/registry';
import RegistryLoadError from '../../src/errors/registry-load';
import { Source } from '../../src/models/source';
import { Package } from '../../src/models/package';
import PackageLoadError from '../../src/errors/package-load';
import GetProjectTreeError from '../../src/errors/get-project-tree';
import { PackageTree } from '../../src/utils/package-tree';
import VetPackageError from '../../src/errors/vet-package';
import CheckProjectError from '../../src/errors/check-project';
import PutPackageError from '../../src/errors/put-package';

describe('models/registry', () => {
    const writeFileInside = (baseDir: string, relPath: string, content: string) => {
        // Write the file inside the temporary directory
        const filePath = path.join(baseDir, relPath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
    };

    const writeFilesInside = (baseDir: string, entries: Map<string, string>) => {
        for (const [relPath, content] of entries) writeFileInside(baseDir, relPath, content);
    };

    // Helper function to create a package with no source files
    const createPackage = async (
        filePath: string,
        name: string,
        deps: Set<string>,
        sourceFiles: Map<string, string> = new Map<string, string>(),
    ) => {
        // Create the source dir
        const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-tmp-source-'));

        // Write the source files
        writeFilesInside(sourceDir, sourceFiles);

        // Create the source object
        const source: Source = await Source.load(sourceDir);

        // Create the archive (this will only tar legal files)
        const archive: Readable = source.getArchive();

        // Create the package
        return await Package.create(filePath, name, deps, archive);
    };

    // Helper function to create a malicious package (with illegal files)
    const createUnfilteredPackage = async (
        filePath: string,
        name: string,
        deps: Set<string>,
        sourceFiles: Map<string, string> = new Map<string, string>(),
    ) => {
        // Create the source dir
        const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-tmp-source-'));

        // Write the source files
        writeFilesInside(sourceDir, sourceFiles);

        // Create the unfiltered archive
        const archive: Readable = tarFs.pack(sourceDir, { entries: Array.from(sourceFiles.keys()) });

        // Create the package
        return await Package.create(filePath, name, deps, archive);
    };

    const depend = (deps: Package[]) => {
        const result = new Set<string>();
        for (const dep of deps) result.add(dep.id);
        return result;
    };

    const globalPackagesPath = path.join(os.tmpdir(), 'apm-tmp-packages');
    let globalPkgs: Package[];

    // Create the example packages
    beforeAll(async () => {
        // Remove the packages directory if it exists
        if (fs.existsSync(globalPackagesPath)) fs.rmSync(globalPackagesPath, { recursive: true, force: true });
        // Create the packages directory
        fs.mkdirSync(globalPackagesPath, { recursive: true });
        // Create the packages

        // LEAF NODES
        const pkg000 = await createPackage(path.join(globalPackagesPath, 'pkg000.apm'), 'pkgA', new Set<string>());
        const pkg001 = await createPackage(path.join(globalPackagesPath, 'pkg001.apm'), 'pkgB', new Set<string>());
        const pkg002 = await createPackage(path.join(globalPackagesPath, 'pkg002.apm'), 'pkgC', new Set<string>());

        const pkg010 = await createPackage(path.join(globalPackagesPath, 'pkg010.apm'), 'pkgD', new Set<string>());
        const pkg011 = await createPackage(path.join(globalPackagesPath, 'pkg011.apm'), 'pkgE', new Set<string>());
        const pkg012 = await createPackage(path.join(globalPackagesPath, 'pkg012.apm'), 'pkgF', new Set<string>());

        const pkg020 = await createPackage(path.join(globalPackagesPath, 'pkg020.apm'), 'pkgG', new Set<string>());
        const pkg021 = await createPackage(path.join(globalPackagesPath, 'pkg021.apm'), 'pkgH', new Set<string>());
        const pkg022 = await createPackage(path.join(globalPackagesPath, 'pkg022.apm'), 'pkgI', new Set<string>());

        const pkg100 = await createPackage(path.join(globalPackagesPath, 'pkg100.apm'), 'pkgA', new Set<string>());
        const pkg101 = await createPackage(path.join(globalPackagesPath, 'pkg101.apm'), 'pkgB', new Set<string>());
        const pkg102 = await createPackage(path.join(globalPackagesPath, 'pkg102.apm'), 'pkgC', new Set<string>());

        const pkg110 = await createPackage(path.join(globalPackagesPath, 'pkg110.apm'), 'pkgD', new Set<string>());
        const pkg111 = await createPackage(path.join(globalPackagesPath, 'pkg111.apm'), 'pkgE', new Set<string>());
        const pkg112 = await createPackage(path.join(globalPackagesPath, 'pkg112.apm'), 'pkgF', new Set<string>());

        // const pkg120 = await createPackage(path.join(globalPackagesPath, 'pkg120.apm'), 'pkgG', new Map());
        const pkg121 = await createPackage(path.join(globalPackagesPath, 'pkg121.apm'), 'pkgH', new Set<string>());
        const pkg122 = await createPackage(path.join(globalPackagesPath, 'pkg122.apm'), 'pkgI', new Set<string>());

        // IMTERMEDIATE NODES
        const pkg00 = await createPackage(
            path.join(globalPackagesPath, 'pkg00.apm'),
            'pkgAlpha',
            new Set<string>([pkg000.id, pkg001.id, pkg002.id]),
        );
        const pkg01 = await createPackage(
            path.join(globalPackagesPath, 'pkg01.apm'),
            'pkgAlpha',
            new Set<string>([pkg010.id, pkg011.id, pkg012.id]),
        );
        const pkg02 = await createPackage(
            path.join(globalPackagesPath, 'pkg02.apm'),
            'pkgBeta',
            new Set<string>([pkg020.id, pkg021.id, pkg022.id]),
        );

        const pkg10 = await createPackage(
            path.join(globalPackagesPath, 'pkg10.apm'),
            'pkgAlpha',
            new Set<string>([pkg100.id, pkg101.id, pkg102.id]),
        );
        const pkg11 = await createPackage(
            path.join(globalPackagesPath, 'pkg11.apm'),
            'pkgAlpha',
            new Set<string>([pkg110.id, pkg111.id, pkg112.id]),
        );
        const pkg12 = await createPackage(
            path.join(globalPackagesPath, 'pkg12.apm'),
            'pkgBeta',
            new Set<string>([pkg100.id, pkg121.id, pkg122.id]), // intentionally, this package is pkg100, peer under pkg10
        );

        // ROOT NODES
        const pkg0 = await createPackage(
            path.join(globalPackagesPath, 'pkg0.apm'),
            'pkgRoot0',
            new Set<string>([pkg00.id, pkg01.id, pkg02.id]),
        );
        const pkg1 = await createPackage(
            path.join(globalPackagesPath, 'pkg1.apm'),
            'pkgRoot1',
            new Set<string>([pkg10.id, pkg11.id, pkg12.id]),
        );

        // Create the package list
        globalPkgs = [
            pkg000,
            pkg001,
            pkg002,
            pkg010,
            pkg011,
            pkg012,
            pkg020,
            pkg021,
            pkg022,
            pkg100,
            pkg101,
            pkg102,
            pkg110,
            pkg111,
            pkg112,
            pkg121,
            pkg122,
            pkg00,
            pkg01,
            pkg02,
            pkg10,
            pkg11,
            pkg12,
            pkg0,
            pkg1,
        ];
    });

    const loadPackagesIntoRegistry = async (registryPath: string, pkgs: Package[]) =>
        Promise.all(
            pkgs.map(async (pkg) => {
                // get the destination package path
                const dest = RegistryTest.getPackagePath(registryPath, pkg.id);
                // create the package path
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                // copy the package
                fs.copyFileSync(pkg.filePath, dest);
            }),
        );

    const testCaseDir = path.join(os.tmpdir(), 'test-case-tmpdir');

    beforeEach(() => {
        // remove the test case dir if it exists
        if (fs.existsSync(testCaseDir)) fs.rmSync(testCaseDir, { recursive: true, force: true });
        // create the test case dir
        fs.mkdirSync(testCaseDir, { recursive: true });
    });

    describe('Registry.create() and Registry.load()', () => {
        const registryPath = path.join(testCaseDir, 'registry');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
        });

        describe('success cases', () => {
            it('zero packages', async () => {
                // expect no error to be thrown
                await expect(Registry.load(registryPath)).resolves.toBeDefined();
            });

            it('one package', async () => {
                // get an inventory of the packages we want
                const pkg0 = globalPkgs[0];
                // create a path to the destination file
                const pkgPath = RegistryTest.getPackagePath(registryPath, pkg0.id);
                // create a file in the registry path
                fs.mkdirSync(path.dirname(pkgPath), { recursive: true });
                fs.copyFileSync(pkg0.filePath, pkgPath);
                // load the registry
                await expect(Registry.load(registryPath)).resolves.toBeDefined();
            });
        });

        describe('failure cases', () => {
            it('should throw RegistryLoadError if the path does not exist', async () => {
                // create a non-existent path
                const nonExistentPath = path.join(testCaseDir, 'non-existent-path');
                // If the path exists, remove it
                if (fs.existsSync(nonExistentPath)) fs.rmSync(nonExistentPath, { recursive: true, force: true });
                // expect rejection, an error to be thrown
                await expect(Registry.load(nonExistentPath)).rejects.toThrow(RegistryLoadError);
            });

            it('should throw RegistryLoadError if the path is not a directory', async () => {
                // create a non-directory path
                const nonDirectoryPath = path.join(testCaseDir, 'non-directory-path');
                // If the path exists, remove it
                if (fs.existsSync(nonDirectoryPath)) fs.rmSync(nonDirectoryPath, { recursive: true, force: true });
                // create a file in the path (not a directory)
                fs.writeFileSync(nonDirectoryPath, 'test');
                // expect rejection, an error to be thrown
                await expect(Registry.load(nonDirectoryPath)).rejects.toThrow(RegistryLoadError);
            });
        });
    });

    describe('Registry.get()', () => {
        const registryPath = path.join(testCaseDir, 'registry');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
        });

        describe('success cases', () => {
            const genericTest = async (pkgCount: number, getPkgIndex: number) => {
                // get an inventory of the packages we want
                const pkgSlice = globalPkgs.slice(0, pkgCount);
                // create temp variable for the package we want to get
                const pkg = globalPkgs[getPkgIndex];
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, pkgSlice);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package
                const resultPkg = await registry.get(pkg.id);
                // expect the package to be defined
                expect(resultPkg).toBeDefined();
                // expect the package to be the correct package
                expect(resultPkg?.name).toEqual(pkg.name);
                expect(resultPkg?.id).toEqual(pkg.id);
                expect(resultPkg?.directDeps).toEqual(pkg.directDeps);
                expect(resultPkg?.archiveOffset).toEqual(pkg.archiveOffset);
            };

            it('one package', async () => await genericTest(1, 0));

            it('two packages, get first', async () => await genericTest(2, 0));

            it('two packages, get second', async () => await genericTest(2, 1));

            it('three packages, get first', async () => await genericTest(3, 0));

            it('three packages, get second', async () => await genericTest(3, 1));

            it('three packages, get third', async () => await genericTest(3, 2));

            it('four packages, get first', async () => await genericTest(4, 0));

            it('four packages, get second', async () => await genericTest(4, 1));

            it('four packages, get third', async () => await genericTest(4, 2));
        });

        describe('failure cases', () => {
            it('should throw PackageLoadError if the path does not exist', async () => {
                // load the registry
                const registry = await Registry.load(registryPath);
                // expect rejection, an error to be thrown
                await expect(registry.get(globalPkgs[0].id)).rejects.toThrow(PackageLoadError);
            });

            it('throws PackageLoadError if the package is not registered (2 packages present)', async () => {
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, globalPkgs.slice(0, 2));
                // load the registry
                const registry = await Registry.load(registryPath);
                // expect rejection, an error to be thrown
                await expect(registry.get(globalPkgs[2].id)).rejects.toThrow(PackageLoadError);
            });
        });
    });

    describe('Registry.getProjectTree()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');

        // // Helper function to check if two arrays of packages are the same
        // const packagesAreSame = (pkgs1: Package[], pkgs2: Package[]) => {
        //     // Sort just by name, as there will never be duplicate names with different ids
        //     const sortedPkgs1 = pkgs1.sort((a, b) => a.name.localeCompare(b.name));
        //     const sortedPkgs2 = pkgs2.sort((a, b) => a.name.localeCompare(b.name));
        //     return (
        //         sortedPkgs1.length === sortedPkgs2.length &&
        //         sortedPkgs1.every(
        //             (pkg, index) => pkg.name === sortedPkgs2[index].name && pkg.id === sortedPkgs2[index].id,
        //         )
        //     );
        // };

        const treesAreSame = (trees1: PackageTree[], trees2: PackageTree[]) => {
            return trees1.every((tree, index) => tree.toString() === trees2[index].toString());
        };

        beforeEach(() => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // create the registry dir
            fs.mkdirSync(registryPath, { recursive: true });
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        describe('success cases', () => {
            it('zero direct deps should produce empty project tree', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg0.directDeps);
                // expect the project tree to be empty
                expect(treesAreSame(result, [])).toBe(true);
            });

            it('single direct dep should produce project tree of the direct dep', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([pkg0]));
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg1.directDeps);
                // expect the project tree to be empty
                expect(treesAreSame(result, [new PackageTree(pkg0, [])])).toBe(true);
            });

            it('single direct dep which has been overridden should not be included in the project tree', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([pkg0]));
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const overrides = new Set<string>([pkg0.name]);
                const visited = new Set<string>();
                const result = await registry.getProjectTree(pkg1.directDeps, overrides, visited);
                // expect the project tree to be empty
                expect(treesAreSame(result, [])).toBe(true);
            });

            it('single direct which has a single indirect dep', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([pkg0]));
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([pkg1]));
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg2.directDeps);
                // expect the project tree to be empty
                expect(treesAreSame(result, [new PackageTree(pkg1, [new PackageTree(pkg0, [])])])).toBe(true);
            });

            it('single direct which has a two indirect deps', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]));
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0, pkg1]),
                );
                const pkg3 = await createPackage(path.join(localPackagesPath, 'pkg3.apm'), 'pkg3', depend([pkg2]));
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg3.directDeps);
                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg2, [new PackageTree(pkg0, []), new PackageTree(pkg1, [])]),
                    ]),
                ).toBe(true);
            });

            it('two direct deps, both have same indirect dep, but it is overridden', async () => {
                // Get the debugger
                const dbg = debug('apm:common:models:Registry:getProjectTree');
                dbg('==============================================');

                // Indicate the specific test
                dbg('Testing two direct deps, both have same indirect dep');

                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([pkg0]));
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([pkg0]));
                const pkg3 = await createPackage(
                    path.join(localPackagesPath, 'pkg3.apm'),
                    'pkg3',
                    depend([pkg0, pkg1, pkg2]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg3.directDeps);
                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg0, []),
                        new PackageTree(pkg1, []),
                        new PackageTree(pkg2, []),
                    ]),
                ).toBe(true);
            });

            it('one direct dep, one grandchild, grandchild is overridden', async () => {
                // Get the debugger
                const dbg = debug('apm:common:models:Registry:getProjectTree');

                // Indicate the specific test
                dbg('Testing two direct deps, both have same indirect dep');

                // Original grandchild package has NO DEPENDENCIES
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([]),
                );
                // Original child package has a dependency on the original grandchild package
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0Original]),
                );

                // Extra package to make the override different
                const pkgExtra = await createPackage(
                    path.join(localPackagesPath, 'pkgExtra.apm'),
                    'pkgExtra',
                    depend([]),
                );
                // Override grandchild package has a dependency on the extra package
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0', // name is the same as the original grandchild package
                    depend([pkgExtra]),
                );
                // Original parent package has a dependency on the original child package, and on the override grandchild package
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg1, pkg0Override]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0Original, pkgExtra, pkg0Override, pkg1, pkg2]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg2.directDeps);

                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg1, []),
                        new PackageTree(pkg0Override, [new PackageTree(pkgExtra, [])]),
                    ]),
                ).toBe(true);
            });

            it('one direct dep, two grandchild, one grandchild is overridden', async () => {
                // Get the debugger
                const dbg = debug('apm:common:models:Registry:getProjectTree');

                // Indicate the specific test
                dbg('Testing two direct deps, both have same indirect dep');

                // Original grandchild package has NO DEPENDENCIES
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([]),
                );
                // Second grandchild package
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]));

                // Extra package to make the override different
                const pkgExtra = await createPackage(
                    path.join(localPackagesPath, 'pkgExtra.apm'),
                    'pkgExtra',
                    depend([]),
                );
                // Override grandchild package has a dependency on the extra package
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0', // name is the same as the original grandchild package
                    depend([pkgExtra]),
                );

                // Child package
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0Original, pkg1]),
                );

                // Original parent package has a dependency on the original child package, and on the override grandchild package
                const pkg3 = await createPackage(
                    path.join(localPackagesPath, 'pkg3.apm'),
                    'pkg3',
                    depend([pkg2, pkg0Override]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0Original, pkgExtra, pkg0Override, pkg1, pkg2, pkg3]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg3.directDeps);
                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg2, [new PackageTree(pkg1, [])]),
                        new PackageTree(pkg0Override, [new PackageTree(pkgExtra, [])]),
                    ]),
                ).toBe(true);
            });

            it('5 direct deps, each with 1 indirect dep', async () => {
                // Grandchild packages
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]));
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([]));
                const pkg3 = await createPackage(path.join(localPackagesPath, 'pkg3.apm'), 'pkg3', depend([]));
                const pkg4 = await createPackage(path.join(localPackagesPath, 'pkg4.apm'), 'pkg4', depend([]));

                // Child packages
                const pkg5 = await createPackage(path.join(localPackagesPath, 'pkg5.apm'), 'pkg5', depend([pkg0]));
                const pkg6 = await createPackage(path.join(localPackagesPath, 'pkg6.apm'), 'pkg6', depend([pkg1]));
                const pkg7 = await createPackage(path.join(localPackagesPath, 'pkg7.apm'), 'pkg7', depend([pkg2]));
                const pkg8 = await createPackage(path.join(localPackagesPath, 'pkg8.apm'), 'pkg8', depend([pkg3]));
                const pkg9 = await createPackage(path.join(localPackagesPath, 'pkg9.apm'), 'pkg9', depend([pkg4]));

                // Parent package
                const pkg10 = await createPackage(
                    path.join(localPackagesPath, 'pkg10.apm'),
                    'pkg10',
                    depend([pkg5, pkg6, pkg7, pkg8, pkg9]),
                );

                // load the package into the registry (DON'T LOAD pkg0Original)
                await loadPackagesIntoRegistry(registryPath, [
                    pkg0,
                    pkg1,
                    pkg2,
                    pkg3,
                    pkg4,
                    pkg5,
                    pkg6,
                    pkg7,
                    pkg8,
                    pkg9,
                    pkg10,
                ]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg10.directDeps);
                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg5, [new PackageTree(pkg0, [])]),
                        new PackageTree(pkg6, [new PackageTree(pkg1, [])]),
                        new PackageTree(pkg7, [new PackageTree(pkg2, [])]),
                        new PackageTree(pkg8, [new PackageTree(pkg3, [])]),
                        new PackageTree(pkg9, [new PackageTree(pkg4, [])]),
                    ]),
                ).toBe(true);
            });

            it('1 great grandchild 1 grandchild, 1 child, child overrides great grandchild', async () => {
                // Great grandchild packages
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([]),
                );
                // Extra package to make the override different
                const pkgExtra = await createPackage(
                    path.join(localPackagesPath, 'pkgExtra.apm'),
                    'pkgExtra',
                    depend([]),
                );
                // Override grandchild package has a dependency on the extra package
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0', // name is the same as the original great grandchild package
                    depend([pkgExtra]),
                );

                // Grandchild packages
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0Original]),
                );

                // Child package
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg1, pkg0Override]),
                );

                // Parent package (doesn't handle the overriding)
                const pkg3 = await createPackage(path.join(localPackagesPath, 'pkg3.apm'), 'pkg3', depend([pkg2]));

                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0Original, pkgExtra, pkg0Override, pkg1, pkg2, pkg3]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg3.directDeps);
                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg2, [
                            new PackageTree(pkg1, []),
                            new PackageTree(pkg0Override, [new PackageTree(pkgExtra, [])]),
                        ]),
                    ]),
                ).toBe(true);
            });

            it('two children, both of which override individual great grandchild packages', async () => {
                // Great grandchild packages
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([]),
                );
                const pkg1Original = await createPackage(
                    path.join(localPackagesPath, 'pkg1Original.apm'),
                    'pkg1',
                    depend([]),
                );
                // Extra package to make the override different
                const pkg0Extra = await createPackage(
                    path.join(localPackagesPath, 'pkg0Extra.apm'),
                    'pkg0Extra',
                    depend([]),
                );
                const pkg1Extra = await createPackage(
                    path.join(localPackagesPath, 'pkg1Extra.apm'),
                    'pkg1Extra',
                    depend([]),
                );
                // Override grandchild package has a dependency on the extra package
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0', // name is the same as the original great grandchild package
                    depend([pkg0Extra]),
                );
                const pkg1Override = await createPackage(
                    path.join(localPackagesPath, 'pkg1Override.apm'),
                    'pkg1', // name is the same as the original great grandchild package
                    depend([pkg1Extra]),
                );

                // Grandchild packages
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0Original]),
                );
                const pkg3 = await createPackage(
                    path.join(localPackagesPath, 'pkg3.apm'),
                    'pkg3',
                    depend([pkg1Original]),
                );

                // Child packages
                const pkg4 = await createPackage(
                    path.join(localPackagesPath, 'pkg4.apm'),
                    'pkg4',
                    depend([pkg2, pkg0Override]),
                );
                const pkg5 = await createPackage(
                    path.join(localPackagesPath, 'pkg5.apm'),
                    'pkg5',
                    depend([pkg3, pkg1Override]),
                );

                // Parent package (doesn't handle the overriding)
                const pkg6 = await createPackage(
                    path.join(localPackagesPath, 'pkg6.apm'),
                    'pkg6',
                    depend([pkg4, pkg5]),
                );

                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [
                    pkg0Original,
                    pkg1Original,
                    pkg0Extra,
                    pkg1Extra,
                    pkg0Override,
                    pkg1Override,
                    pkg2,
                    pkg3,
                    pkg4,
                    pkg5,
                    pkg6,
                ]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const result = await registry.getProjectTree(pkg6.directDeps);
                // expect the project tree to be empty
                expect(
                    treesAreSame(result, [
                        new PackageTree(pkg4, [
                            new PackageTree(pkg2, []),
                            new PackageTree(pkg0Override, [new PackageTree(pkg0Extra, [])]),
                        ]),
                        new PackageTree(pkg5, [
                            new PackageTree(pkg3, []),
                            new PackageTree(pkg1Override, [new PackageTree(pkg1Extra, [])]),
                        ]),
                    ]),
                ).toBe(true);
            });
        });

        describe('failure cases', () => {
            it('one direct dep, one unresolved peer dep', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', new Set<string>());
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    new Set<string>([pkg0.id]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const overrides = new Set<string>();
                const visited = new Set<string>([pkg0.name]);
                // expect rejection, an error to be thrown
                await expect(registry.getProjectTree(pkg1.directDeps, overrides, visited)).rejects.toThrow(
                    GetProjectTreeError,
                );
            });

            it('two direct deps, both have same indirect dep', async () => {
                // Get the debugger
                const dbg = debug('apm:common:models:Registry:getProjectTree');

                // Indicate the specific test
                dbg('Testing two direct deps, both have same indirect dep');

                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', new Set<string>());
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    new Set<string>([pkg0.id]),
                );
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    new Set<string>([pkg0.id]),
                );
                const pkg3 = await createPackage(
                    path.join(localPackagesPath, 'pkg3.apm'),
                    'pkg3',
                    new Set<string>([pkg1.id, pkg2.id]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // expect rejection, an error to be thrown
                await expect(registry.getProjectTree(pkg3.directDeps)).rejects.toThrow(GetProjectTreeError);
            });

            it('one direct dep, but dep doesnt exist in registry', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', new Set<string>());
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    new Set<string>([pkg0.id]),
                );
                // load the package into the registry (DON'T LOAD pkg0)
                await loadPackagesIntoRegistry(registryPath, [pkg1]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // expect rejection, an error to be thrown
                await expect(registry.getProjectTree(pkg1.directDeps)).rejects.toThrow(PackageLoadError);
            });

            it('one direct dep, one indirect dep, but indirect dep doesnt exist in registry', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', new Set<string>());
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    new Set<string>([pkg0.id]),
                );
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    new Set<string>([pkg1.id]),
                );

                // load the package into the registry (DON'T LOAD pkg0)
                await loadPackagesIntoRegistry(registryPath, [pkg1, pkg2]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // expect rejection, an error to be thrown
                await expect(registry.getProjectTree(pkg2.directDeps)).rejects.toThrow(PackageLoadError);
            });

            it('2 children, both with 1 grandchild, first grandchild is an unresolve peer dep of grandchild 2', async () => {
                // Peer dependency package
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', new Set<string>());

                // Second grandchild package
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    new Set<string>([pkg0.id]),
                );

                // Child packages
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    new Set<string>([pkg0.id]),
                );
                const pkg3 = await createPackage(
                    path.join(localPackagesPath, 'pkg3.apm'),
                    'pkg3',
                    new Set<string>([pkg1.id]),
                );

                // Parent package
                const pkg4 = await createPackage(
                    path.join(localPackagesPath, 'pkg4.apm'),
                    'pkg4',
                    new Set<string>([pkg2.id, pkg3.id]),
                );

                // load the package into the registry (DON'T LOAD pkg0)
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3, pkg4]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // expect rejection, an error to be thrown
                await expect(registry.getProjectTree(pkg4.directDeps)).rejects.toThrow(GetProjectTreeError);
            });
        });
    });

    describe('Registry.getPackageTree()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');

        // // Helper function to check if two arrays of packages are the same
        // const packagesAreSame = (pkgs1: Package[], pkgs2: Package[]) => {
        //     // DO NOT SORT THE ARRAYS
        //     return (
        //         pkgs1.length === pkgs2.length &&
        //         pkgs1.every((pkg, index) => pkg.name === pkgs2[index].name && pkg.id === pkgs2[index].id)
        //     );
        // };

        const treesAreSame = (trees1: PackageTree[], trees2: PackageTree[]) => {
            return trees1.every((tree, index) => tree.toString() === trees2[index].toString());
        };

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        describe('success cases', () => {
            // const genericTest = async (
            //     includedPkgs: { id: number; name: string; deps: number[] }[],
            //     rootId: number,
            //     expectedPkgIds: number[],
            // ) => {
            //     // Create the packages
            //     const pkgs: Map<number, Package> = new Map();
            //     for (const pkgDesc of includedPkgs) {
            //         // Construct the file path
            //         const filePath = path.join(localPackagesPath, `${pkgDesc.id}.apm`);
            //         // Construct the direct dependencies
            //         const directDeps = new Map<string, string>();
            //         for (const id of pkgDesc.deps) {
            //             const depPkg = pkgs.get(id)!;
            //             directDeps.set(depPkg.name, depPkg.id);
            //         }
            //         // Construct the package
            //         const pkg = await createPackage(filePath, pkgDesc.name, directDeps);
            //         // Add the package to the map
            //         pkgs.set(pkgDesc.id, pkg);
            //     }

            //     // Get the root package
            //     const rootPkg = pkgs.get(rootId)!;

            //     // Get the expected packages
            //     const expectedPkgs = expectedPkgIds.map((id) => pkgs.get(id)!);

            //     // Load the packages into the registry
            //     await loadPackagesIntoRegistry(registryPath, Array.from(pkgs.values()));

            //     // load the registry
            //     const registry = await Registry.load(registryPath);

            //     // get the project tree
            //     const result = await registry.getPackageTree(rootPkg.name, rootPkg.id);

            //     // expect the project tree to be empty
            //     expect(packagesAreSame(result, expectedPkgs)).toBe(true);
            // };

            it('single package for a package with no dependencies', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                // load the package into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg0.id);
                // expect the package tree to contain all packages
                expect(result.toString()).toBe(new PackageTree(pkg0, []).toString());
            });

            it('one package with one dependency', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([pkg0]));
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg1.id);
                // expect the package tree to contain all packages
                expect(result.toString()).toBe(new PackageTree(pkg1, [new PackageTree(pkg0, [])]).toString());
            });

            it('one package with two dependencies', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]));
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0, pkg1]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg2.id);
                // expect the package tree to contain all packages
                expect(result.toString()).toBe(
                    new PackageTree(pkg2, [new PackageTree(pkg0, []), new PackageTree(pkg1, [])]).toString(),
                );
            });

            it('two children, each with one grandchild', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]));
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([pkg0]));
                const pkg3 = await createPackage(path.join(localPackagesPath, 'pkg3.apm'), 'pkg3', depend([pkg1]));
                const pkg4 = await createPackage(
                    path.join(localPackagesPath, 'pkg4.apm'),
                    'pkg4',
                    depend([pkg2, pkg3]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3, pkg4]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg4.id);
                // expect the package tree to contain all packages
                expect(result.toString()).toBe(
                    new PackageTree(pkg4, [
                        new PackageTree(pkg2, [new PackageTree(pkg0, [])]),
                        new PackageTree(pkg3, [new PackageTree(pkg1, [])]),
                    ]).toString(),
                );
            });

            it('two children, each with two grandchildren', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]));
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([]));
                const pkg3 = await createPackage(path.join(localPackagesPath, 'pkg3.apm'), 'pkg3', depend([]));
                const pkg4 = await createPackage(
                    path.join(localPackagesPath, 'pkg4.apm'),
                    'pkg4',
                    depend([pkg0, pkg1]),
                );
                const pkg5 = await createPackage(
                    path.join(localPackagesPath, 'pkg5.apm'),
                    'pkg5',
                    depend([pkg2, pkg3]),
                );
                const pkg6 = await createPackage(
                    path.join(localPackagesPath, 'pkg6.apm'),
                    'pkg6',
                    depend([pkg4, pkg5]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3, pkg4, pkg5, pkg6]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg6.id);
                // expect the package tree to contain all packages
                expect(result.toString()).toBe(
                    new PackageTree(pkg6, [
                        new PackageTree(pkg4, [new PackageTree(pkg0, []), new PackageTree(pkg1, [])]),
                        new PackageTree(pkg5, [new PackageTree(pkg2, []), new PackageTree(pkg3, [])]),
                    ]).toString(),
                );
            });

            it('two children, each with same grandchild', async () => {
                const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]));
                const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([pkg0]));
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([pkg0]));
                const pkg3 = await createPackage(
                    path.join(localPackagesPath, 'pkg3.apm'),
                    'pkg3',
                    depend([pkg1, pkg2]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0, pkg1, pkg2, pkg3]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg3.id);
                // expect the package tree to contain only one instance of pkg0
                expect(result.toString()).toBe(
                    new PackageTree(pkg3, [
                        new PackageTree(pkg1, [new PackageTree(pkg0, [])]),
                        new PackageTree(pkg2, []), // the specific package (pkg0) is already in the tree
                    ]).toString(),
                );
            });

            it('two children, one child has a grandchild that is overridden by other child', async () => {
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([]),
                );
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['Main.agda', 'module pkg0.Main where']]),
                );
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0Original]),
                );
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0Override, pkg1]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [pkg0Original, pkg0Override, pkg1, pkg2]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg2.id);
                // expect the package tree to include BOTH the original and overridden versions of pkg0
                //     (this is because only duplicate IDs are removed from the tree, not names)
                expect(result.toString()).toBe(
                    new PackageTree(pkg2, [
                        new PackageTree(pkg0Override, []),
                        new PackageTree(pkg1, [new PackageTree(pkg0Original, [])]),
                    ]).toString(),
                );
            });

            it('two children, each with two grandchildren, each with two great grandchildren, two great grandchildren are duplicates', async () => {
                // create the 15 packages - 2 duplicates
                const pkg2 = await createPackage(path.join(localPackagesPath, 'pkg2.apm'), 'pkg2', depend([]));
                const pkg3 = await createPackage(path.join(localPackagesPath, 'pkg3.apm'), 'pkg3', depend([]));
                const pkg4 = await createPackage(path.join(localPackagesPath, 'pkg4.apm'), 'pkg4', depend([]));
                const pkg5 = await createPackage(path.join(localPackagesPath, 'pkg5.apm'), 'pkg5', depend([]));
                const pkg6 = await createPackage(path.join(localPackagesPath, 'pkg6.apm'), 'pkg6', depend([]));
                const pkg7 = await createPackage(path.join(localPackagesPath, 'pkg7.apm'), 'pkg7', depend([]));
                const pkg8 = await createPackage(
                    path.join(localPackagesPath, 'pkg8.apm'),
                    'pkg8',
                    depend([pkg2, pkg3]),
                );
                const pkg9 = await createPackage(
                    path.join(localPackagesPath, 'pkg9.apm'),
                    'pkg9',
                    depend([pkg4, pkg5]),
                );
                const pkg10 = await createPackage(
                    path.join(localPackagesPath, 'pkg10.apm'),
                    'pkg10',
                    depend([pkg6, pkg2]),
                );
                const pkg11 = await createPackage(
                    path.join(localPackagesPath, 'pkg11.apm'),
                    'pkg11',
                    depend([pkg2, pkg7]),
                );
                const pkg12 = await createPackage(
                    path.join(localPackagesPath, 'pkg12.apm'),
                    'pkg12',
                    depend([pkg8, pkg9]),
                );
                const pkg13 = await createPackage(
                    path.join(localPackagesPath, 'pkg13.apm'),
                    'pkg13',
                    depend([pkg10, pkg11]),
                );
                const pkg14 = await createPackage(
                    path.join(localPackagesPath, 'pkg14.apm'),
                    'pkg14',
                    depend([pkg12, pkg13]),
                );
                // load the packages into the registry
                await loadPackagesIntoRegistry(registryPath, [
                    pkg2,
                    pkg3,
                    pkg4,
                    pkg5,
                    pkg6,
                    pkg7,
                    pkg8,
                    pkg9,
                    pkg10,
                    pkg11,
                    pkg12,
                    pkg13,
                    pkg14,
                ]);
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                const result = await registry.getPackageTree(pkg14.id);
                // expect the package tree to include BOTH the original and overridden versions of pkg0
                //     (this is because only duplicate IDs are removed from the tree, not names)
                expect(result.toString()).toBe(
                    new PackageTree(pkg14, [
                        new PackageTree(pkg12, [
                            new PackageTree(pkg8, [new PackageTree(pkg2, []), new PackageTree(pkg3, [])]),
                            new PackageTree(pkg9, [new PackageTree(pkg4, []), new PackageTree(pkg5, [])]),
                        ]),
                        new PackageTree(pkg13, [
                            new PackageTree(pkg10, [new PackageTree(pkg6, []) /*, new PackageTree(pkg2, [])*/]), // pkg2 is a duplicate
                            new PackageTree(pkg11, [/*new PackageTree(pkg2, []),*/ new PackageTree(pkg7, [])]), // pkg2 is a duplicate
                        ]),
                    ]).toString(),
                );
            });
        });
        describe('failure cases', () => {
            it('root package not in registry', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the package tree
                await expect(registry.getPackageTree(pkg0.id)).rejects.toThrow(PackageLoadError);
            });
        });
    });

    describe('Registry.vet()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        describe('success cases', () => {
            it('package with no source files', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with one agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.agda', 'module pkg0.src.Main where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with one md file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.md', '# pkg0.src.Main']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with one md file and one agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['src/Main.md', '# pkg0.src.Main'],
                        ['src/Main.agda', 'module pkg0.src.Main where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with one illegal file PASSES vetting if archive is filtered', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.txt', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with multiple agda files', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Main2 where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with md file in hidden directory', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['.hidden/Main.md', '# pkg0.Main']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('package with three agda files', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Main2 where'],
                        ['Main3.agda', 'module pkg0.Main3 where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await registry.vet(pkg0);
            });

            it('registered dependency, no code used from dependency', async () => {
                // create the dependency, NOTE IT IS REGISTERED
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                const pkg1 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the dependency into the registry manually
                fs.copyFileSync(pkg0.filePath, RegistryTest.getPackagePath(registryPath, pkg0.id));
                // vet the package
                await registry.vet(pkg1);
            });

            it('two registered dependencies, no code used from dependencies', async () => {
                // create the dependency, NOTE IT IS REGISTERED
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                const pkg1 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([]),
                    new Map(),
                );
                const pkg2 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0, pkg1]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the dependencies into the registry manually
                fs.copyFileSync(pkg0.filePath, RegistryTest.getPackagePath(registryPath, pkg0.id));
                fs.copyFileSync(pkg1.filePath, RegistryTest.getPackagePath(registryPath, pkg1.id));
                // vet the packages
                await registry.vet(pkg2);
            });

            it('registered dependency, code used from dependency', async () => {
                // create the dependency, NOTE IT IS REGISTERED
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        [
                            'src/Main.agda',
                            `
                        module pkg0.src.Main where
                        data X : Set where
                            x : X
                        `,
                        ],
                    ]),
                );
                const pkg1 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0]),
                    new Map([
                        [
                            'src/Main.agda',
                            `
                        module pkg1.src.Main where
                        open import pkg0.src.Main
                        z : X
                        z = x
                        `,
                        ],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the dependency into the registry manually
                fs.copyFileSync(pkg0.filePath, RegistryTest.getPackagePath(registryPath, pkg0.id));
                // vet the package
                await registry.vet(pkg1);
            });

            it('two registered dependencies, code used from dependencies', async () => {
                // create the dependency, NOTE IT IS REGISTERED
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        [
                            'src/Main.agda',
                            `
                        module pkg0.src.Main where
                        data X : Set where
                            x : X
                        `,
                        ],
                    ]),
                );
                const pkg1 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([]),
                    new Map([
                        [
                            'src/Main.agda',
                            `
                        module pkg1.src.Main where
                        data Y : Set where
                            y : Y
                        `,
                        ],
                    ]),
                );
                const pkg2 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([pkg0, pkg1]),
                    new Map([
                        [
                            'src/Main.agda',
                            `
                        module pkg2.src.Main where
                        open import pkg0.src.Main
                        open import pkg1.src.Main
                        z1 : X
                        z1 = x
                        z2 : Y
                        z2 = y
                        `,
                        ],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the dependencies into the registry manually
                fs.copyFileSync(pkg0.filePath, RegistryTest.getPackagePath(registryPath, pkg0.id));
                fs.copyFileSync(pkg1.filePath, RegistryTest.getPackagePath(registryPath, pkg1.id));
                // vet the packages
                await registry.vet(pkg2);
            });
        });

        describe('failure cases', () => {
            it('package with one illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.txt', 'module pkg0.src.Main where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one legal file and one illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['src/Main.agda', 'module pkg0.src.Main where'],
                        ['src/Main.txt', 'Illegal file'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one legal file and one hidden illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['src/Main.agda', 'module pkg0.src.Main where'],
                        ['src/.Main.txt', 'Illegal file'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one hidden illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/.Main.txt', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one illegal file with no extension', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/noextension', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one illegal file in a hidden directory', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['.hidden/noextension', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with no files but wrong id', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0, '1.0.0')).rejects.toThrow(VetPackageError);
            });

            it('invalid agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['Main.agda', 'module pkg0.Main1 where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(CheckProjectError);
            });

            it('one valid agda file and one invalid agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Maind where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg0)).rejects.toThrow(CheckProjectError);
            });

            it('unregistered dependency', async () => {
                // create the dependency, NOTE IT IS NOT REGISTERED
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                const pkg1 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.vet(pkg1)).rejects.toThrow(PackageLoadError);
            });
        });
    });

    describe('Registry.put()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        describe('success cases', () => {
            it('package with no source files', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with no source files and expected id', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0, pkg0.id);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with one agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.agda', 'module pkg0.src.Main where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with one agda file and expected id', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.agda', 'module pkg0.src.Main where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0, pkg0.id);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with one md file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.md', '# pkg0.src.Main']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with one md file and one agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['src/Main.md', '# pkg0.src.Main'],
                        ['src/Main.agda', 'module pkg0.src.Main where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with one illegal file PASSES vetting if archive is filtered', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.txt', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with multiple agda files', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Main2 where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with multiple agda files and expected id', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Main2 where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0, pkg0.id);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with md file in hidden directory', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['.hidden/Main.md', '# pkg0.Main']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });

            it('package with three agda files', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Main2 where'],
                        ['Main3.agda', 'module pkg0.Main3 where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
            });
        });

        describe('failure cases', () => {
            it('package with one illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/Main.txt', 'module pkg0.src.Main where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one legal file and one illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['src/Main.agda', 'module pkg0.src.Main where'],
                        ['src/Main.txt', 'Illegal file'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one legal file and one hidden illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['src/Main.agda', 'module pkg0.src.Main where'],
                        ['src/.Main.txt', 'Illegal file'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one hidden illegal file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/.Main.txt', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one illegal file with no extension', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['src/noextension', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with one illegal file in a hidden directory', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['.hidden/noextension', 'Illegal file']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(VetPackageError);
            });

            it('package with no files but wrong id', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0, '1.0.0')).rejects.toThrow(VetPackageError);
            });

            it('invalid agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([['Main.agda', 'module pkg0.Main1 where']]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(CheckProjectError);
            });

            it('one valid agda file and one invalid agda file', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map([
                        ['Main.agda', 'module pkg0.Main where'],
                        ['Main2.agda', 'module pkg0.Maind where'],
                    ]),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // vet the package
                await expect(registry.put(pkg0)).rejects.toThrow(CheckProjectError);
            });

            it('package already registered', async () => {
                const pkg0 = await createUnfilteredPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                // try to get the package after
                const recovered = await registry.get(pkg0.id);
                // expect the recovered package to be the same as the original
                expect(recovered.id).toBe(pkg0.id);
                // try to put the package again
                await expect(registry.put(pkg0)).rejects.toThrow(PutPackageError);
            });
        });
    });

    describe('Registry.ls()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        it('empty registry, and empty set input', async () => {
            // load the registry
            const registry = await Registry.load(registryPath);
            // list the packages
            const result = await registry.ls(new Set());
            // expect the result to be empty
            expect(result.size).toBe(0);
        });

        it('empty registry, and non-empty set input', async () => {
            // load the registry
            const registry = await Registry.load(registryPath);
            // list the packages
            const result = await registry.ls(new Set<string>(['1.0.0']));
            // expect the result to be empty
            expect(result.size).toBe(0);
        });

        it('1 package in registry, empty set input', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            // list the packages
            const result = await registry.ls(new Set<string>());
            // expect the result to be the package
            expect(result.size).toBe(1);
            expect(Array.from(result)).toEqual([pkg0.id]);
        });

        it('1 package in registry, ls that package', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            // list the packages
            const result = await registry.ls(new Set<string>([pkg0.id]));
            // expect the result to be the package
            expect(result.size).toBe(1);
            expect(Array.from(result)).toEqual([pkg0.id]);
        });

        it('1 package in registry, ls a different package', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            // list the packages
            const result = await registry.ls(new Set<string>(['1.0.0']));
            // expect the result to be empty
            expect(result.size).toBe(0);
        });

        it('2 packages in registry, ls both packages', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            await registry.put(pkg1);
            // list the packages
            const result = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
            // expect the result to be the packages
            expect(result.size).toBe(2);
            expect(Array.from(result)).toEqual([pkg0.id, pkg1.id]);
        });

        it('2 packages in registry, ls only one package', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            await registry.put(pkg1);
            // list the packages
            const result = await registry.ls(new Set<string>([pkg0.id]));
            // expect the result to be the packages
            expect(result.size).toBe(1);
            expect(Array.from(result)).toEqual([pkg0.id]);
        });

        it('1 package in registry, ls 2 packages, one of which is not in the registry', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            // list the packages
            const result = await registry.ls(new Set<string>([pkg0.id, '1.0.0']));
            // expect the result to be the package in the registry
            expect(result.size).toBe(1);
            expect(Array.from(result)).toEqual([pkg0.id]);
        });

        it('2 packages in registry, empty set input', async () => {
            const pkg0 = await createPackage(path.join(localPackagesPath, 'pkg0.apm'), 'pkg0', depend([]), new Map());
            const pkg1 = await createPackage(path.join(localPackagesPath, 'pkg1.apm'), 'pkg1', depend([]), new Map());
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the package
            await registry.put(pkg0);
            await registry.put(pkg1);
            // list the packages
            const result = await registry.ls(new Set<string>());
            // expect the result to be the packages
            expect(result.size).toBe(2);
            expect(result).toEqual(new Set([pkg0.id, pkg1.id]));
        });
    });
});
