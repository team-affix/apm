import { appRouter } from '../src/router';
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Package, Registry, Source } from '@team-affix/apm-common';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

// Create a caller to test the router directly
const caller = appRouter.createCaller({});

describe('router', () => {
    // The temporary directory for the test case
    let testCaseDir: string;

    beforeEach(async () => {
        // Construct the temporary directory for the test case
        testCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-server-tests'));
        // Remove the temporary directory if it exists
        if (fs.existsSync(testCaseDir)) fs.rmSync(testCaseDir, { recursive: true });
        // Create the temporary directory
        fs.mkdirSync(testCaseDir, { recursive: true });
        // Create the mock default registry path
        const mockDefaultRegistryPath = path.join(testCaseDir, 'registry');
        // Create the mock default registry
        await Registry.create(mockDefaultRegistryPath);
        // Mock the default registry with one we control
        jest.spyOn(Registry, 'getDefault').mockResolvedValue(await Registry.load(mockDefaultRegistryPath));
    });

    afterEach(() => {
        // Clean up after each test
        jest.restoreAllMocks();
    });

    // Creates a package given:
    //     - The package name
    //     - The package dependencies
    //     - The package's source files in a map of file paths to file contents
    async function createPkg(
        name: string,
        deps: Set<string>,
        sourceFiles: Map<string, string> = new Map<string, string>(),
    ): Promise<Package> {
        // create a temp directory for the package
        const pkgDir = fs.mkdtempSync(path.join(testCaseDir, 'package'));

        // Create a temporary directory for the package
        const sourceDir = path.join(pkgDir, 'source');
        await Source.create(sourceDir);

        // Create the package files
        for (const [filePath, fileContent] of sourceFiles.entries()) {
            // Create the directory for the file
            const dir = path.dirname(filePath);
            const dirAbs = path.join(sourceDir, dir);
            if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
            // Create the file
            const fileAbs = path.join(sourceDir, filePath);
            fs.writeFileSync(fileAbs, fileContent);
        }

        // Load the source
        const source = await Source.load(sourceDir);

        // Create the package
        const pkgPath = path.join(pkgDir, `pkg.apm`);
        return await Package.create(pkgPath, name, deps, source.getArchive());
    }

    // Creates a package in the default registry given:
    //     - The package name
    //     - The package dependencies
    //     - The package's source files in a map of file paths to file contents
    async function createAndRegister(
        name: string,
        deps: Set<string>,
        sourceFiles: Map<string, string> = new Map<string, string>(),
    ): Promise<Package> {
        // Create the package
        const pkg = await createPkg(name, deps, sourceFiles);

        // Put the package in the registry
        const registry = await Registry.getDefault();
        await registry.put(pkg, pkg.id);

        // Return the package
        return pkg;
    }

    describe('getPullDependencies()', () => {
        describe('success cases', () => {
            test('valid root id, no dependencies', async () => {
                // Create a package
                const pkg0 = await createAndRegister('test', new Set<string>([]));

                const result = await caller.getPullDependencies({
                    rootId: pkg0.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id]);
            });
            test('valid root id, one dependency', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([pkg0.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg1.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id, pkg1.id]);
            });
            test('valid root id, two direct dependencies', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([]));
                const pkg2 = await createAndRegister('test2', new Set<string>([pkg0.id, pkg1.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg2.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id, pkg1.id, pkg2.id]);
            });
            test('valid root id, one direct and one indirect dependency', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([pkg0.id]));
                const pkg2 = await createAndRegister('test2', new Set<string>([pkg1.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg2.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id, pkg1.id, pkg2.id]);
            });
            test('valid root id, two direct each with one indirect dependency', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([]));
                const pkg2 = await createAndRegister('test2', new Set<string>([pkg0.id]));
                const pkg3 = await createAndRegister('test3', new Set<string>([pkg1.id]));
                const pkg4 = await createAndRegister('test4', new Set<string>([pkg2.id, pkg3.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg4.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id, pkg2.id, pkg1.id, pkg3.id, pkg4.id]);
            });
            test('valid root id, two direct each with same indirect dependency', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([pkg0.id]));
                const pkg2 = await createAndRegister('test2', new Set<string>([pkg0.id]));
                const pkg3 = await createAndRegister('test3', new Set<string>([pkg0.id, pkg1.id, pkg2.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg3.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id, pkg1.id, pkg2.id, pkg3.id]);
            });
            test('valid root id, two direct each with two indirect dependencies', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([]));
                const pkg2 = await createAndRegister('test2', new Set<string>([]));
                const pkg3 = await createAndRegister('test3', new Set<string>([]));
                const pkg4 = await createAndRegister('test4', new Set<string>([pkg0.id, pkg1.id]));
                const pkg5 = await createAndRegister('test5', new Set<string>([pkg2.id, pkg3.id]));
                const pkg6 = await createAndRegister('test6', new Set<string>([pkg4.id, pkg5.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg6.id,
                });

                expect(result.pkgIds).toEqual([pkg0.id, pkg1.id, pkg4.id, pkg2.id, pkg3.id, pkg5.id, pkg6.id]);
            });
            test('valid root id, two direct each with two indirect dependencies, one of which is a duplicate', async () => {
                // Create packages
                const pkg0 = await createAndRegister('test0', new Set<string>([]));
                const pkg1 = await createAndRegister('test1', new Set<string>([]));
                const pkg2 = await createAndRegister('test2', new Set<string>([]));
                const pkg3 = await createAndRegister('test3', new Set<string>([pkg0.id, pkg1.id]));
                const pkg4 = await createAndRegister('test4', new Set<string>([pkg1.id, pkg2.id]));
                const pkg5 = await createAndRegister('test5', new Set<string>([pkg1.id, pkg3.id, pkg4.id]));

                const result = await caller.getPullDependencies({
                    rootId: pkg5.id,
                });

                expect(result.pkgIds).toEqual([pkg1.id, pkg0.id, pkg3.id, pkg2.id, pkg4.id, pkg5.id]);
            });
        });
        describe('failure cases', () => {
            test('empty rootId should result in error', async () => {
                await expect(
                    caller.getPullDependencies({
                        rootId: '',
                    }),
                ).rejects.toThrow(TRPCError);
            });
            test('invalid root id should result in error', async () => {
                await expect(
                    caller.getPullDependencies({
                        rootId: 'invalid-id',
                    }),
                ).rejects.toThrow(TRPCError);
            });
        });
    });

    describe('get()', () => {
        describe('success cases', () => {
            test('get with valid id should return the package bytes', async () => {
                // Create a package
                const pkg0 = await createAndRegister('test', new Set<string>([]));

                // read the package bytes from file
                const pkgBytes = fs.readFileSync(pkg0.filePath);

                const result = await caller.get({
                    id: pkg0.id,
                });

                expect(result.b64).toEqual(pkgBytes.toString('base64'));
            });
        });
        describe('failure cases', () => {
            test('get with empty id should result in error', async () => {
                await expect(
                    caller.get({
                        id: '',
                    }),
                ).rejects.toThrow(TRPCError);
            });
            test('get with invalid id should result in error', async () => {
                await expect(
                    caller.get({
                        id: 'invalid-id',
                    }),
                ).rejects.toThrow(TRPCError);
            });
        });
    });

    describe('ls()', () => {
        test('ls with empty ids array should return empty ids array', async () => {
            const result = await caller.ls({
                ids: [],
            });

            expect(result.ids).toEqual([]);
            expect(Array.isArray(result.ids)).toBe(true);
            expect(result.ids.length).toBe(0);
        });

        test('ls with single valid id should return the package id', async () => {
            // Create a package
            const pkg0 = await createAndRegister('test', new Set<string>([]));

            const result = await caller.ls({
                ids: [pkg0.id],
            });

            expect(result.ids).toEqual([pkg0.id]);
        });

        test('ls with one valid id and one invalid id should return the valid id', async () => {
            // Create a package
            const pkg0 = await createAndRegister('test', new Set<string>([]));

            const result = await caller.ls({
                ids: [pkg0.id, 'invalid-id'],
            });

            expect(result.ids).toEqual([pkg0.id]);
        });
    });

    describe('put()', () => {
        describe('success cases', () => {
            test('put single package, empty target registry', async () => {
                // Create a package
                const pkg0 = await createPkg('test', new Set<string>([]));

                // read the package bytes from file
                const pkgBytes = fs.readFileSync(pkg0.filePath);
                const b64 = pkgBytes.toString('base64');

                // Expect the package to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id]));
                expect(lsResult.size).toBe(0);

                // Put the package
                const result = await caller.put({
                    id: pkg0.id,
                    b64,
                });

                // Expect the id to be the same
                expect(result.id).toEqual(pkg0.id);

                // Get the package from the registry
                const pkg0recovered = await registry.get(pkg0.id);

                // Expect the package to be the same
                expect(pkg0recovered.id).toEqual(pkg0.id);
                expect(pkg0recovered.name).toEqual(pkg0.name);
                expect(pkg0recovered.directDeps).toEqual(pkg0.directDeps);
            });

            test('put single package, non-empty target registry', async () => {
                // Create a package which already exists in the registry
                await createAndRegister('PreexistingPackage', new Set<string>([]));

                // Create a package
                const pkg0 = await createPkg('test', new Set<string>([]));

                // read the package bytes from file
                const pkgBytes = fs.readFileSync(pkg0.filePath);
                const b64 = pkgBytes.toString('base64');

                // Expect the package to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id]));
                expect(lsResult.size).toBe(0);

                // Put the package
                const result = await caller.put({
                    id: pkg0.id,
                    b64,
                });

                // Expect the id to be the same
                expect(result.id).toEqual(pkg0.id);

                // Get the package from the registry
                const pkg0recovered = await registry.get(pkg0.id);

                // Expect the package to be the same
                expect(pkg0recovered.id).toEqual(pkg0.id);
                expect(pkg0recovered.name).toEqual(pkg0.name);
                expect(pkg0recovered.directDeps).toEqual(pkg0.directDeps);
            });

            test('put two independent packages, empty target registry', async () => {
                // Create a package
                const pkg0 = await createPkg('test0', new Set<string>([]));
                const pkg1 = await createPkg('test1', new Set<string>([]));

                // read the package bytes from file
                const pkg0Bytes = fs.readFileSync(pkg0.filePath);
                const pkg0B64 = pkg0Bytes.toString('base64');
                const pkg1Bytes = fs.readFileSync(pkg1.filePath);
                const pkg1B64 = pkg1Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
                expect(lsResult.size).toBe(0);

                // Put the packages
                const result0 = await caller.put({
                    id: pkg0.id,
                    b64: pkg0B64,
                });
                const result1 = await caller.put({
                    id: pkg1.id,
                    b64: pkg1B64,
                });

                // Expect the ids to be the same
                expect(result0.id).toEqual(pkg0.id);
                expect(result1.id).toEqual(pkg1.id);

                // Get the packages from the registry
                const pkg0recovered = await registry.get(pkg0.id);
                const pkg1recovered = await registry.get(pkg1.id);

                // Expect the packages to be the same
                expect(pkg0recovered.id).toEqual(pkg0.id);
                expect(pkg0recovered.name).toEqual(pkg0.name);
                expect(pkg0recovered.directDeps).toEqual(pkg0.directDeps);
                expect(pkg1recovered.id).toEqual(pkg1.id);
                expect(pkg1recovered.name).toEqual(pkg1.name);
                expect(pkg1recovered.directDeps).toEqual(pkg1.directDeps);
            });

            test('put two dependent packages, empty target registry', async () => {
                // Create a package
                const pkg0 = await createPkg('test0', new Set<string>([]));
                const pkg1 = await createPkg('test1', new Set<string>([pkg0.id]));

                // read the package bytes from file
                const pkg0Bytes = fs.readFileSync(pkg0.filePath);
                const pkg0B64 = pkg0Bytes.toString('base64');
                const pkg1Bytes = fs.readFileSync(pkg1.filePath);
                const pkg1B64 = pkg1Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
                expect(lsResult.size).toBe(0);

                // Put the packages
                const result0 = await caller.put({
                    id: pkg0.id,
                    b64: pkg0B64,
                });
                const result1 = await caller.put({
                    id: pkg1.id,
                    b64: pkg1B64,
                });

                // Expect the ids to be the same
                expect(result0.id).toEqual(pkg0.id);
                expect(result1.id).toEqual(pkg1.id);

                // Get the packages from the registry
                const pkg0recovered = await registry.get(pkg0.id);
                const pkg1recovered = await registry.get(pkg1.id);

                // Expect the packages to be the same
                expect(pkg0recovered.id).toEqual(pkg0.id);
                expect(pkg0recovered.name).toEqual(pkg0.name);
                expect(pkg0recovered.directDeps).toEqual(pkg0.directDeps);
                expect(pkg1recovered.id).toEqual(pkg1.id);
                expect(pkg1recovered.name).toEqual(pkg1.name);
                expect(pkg1recovered.directDeps).toEqual(pkg1.directDeps);
            });

            test('put package WITH VALID AGDA CODE', async () => {
                // Create a package
                const pkg0 = await createPkg(
                    'Test',
                    new Set<string>([]),
                    new Map<string, string>([['Main.agda', 'module Test.Main where']]),
                );

                // read the package bytes from file
                const pkg0Bytes = fs.readFileSync(pkg0.filePath);
                const pkg0B64 = pkg0Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id]));
                expect(lsResult.size).toBe(0);

                // Put the package
                const result = await caller.put({
                    id: pkg0.id,
                    b64: pkg0B64,
                });

                // Expect the id to be the same
                expect(result.id).toEqual(pkg0.id);

                // Get the package from the registry
                const pkg0recovered = await registry.get(pkg0.id);

                // Expect the package to be the same
                expect(pkg0recovered.id).toEqual(pkg0.id);
                expect(pkg0recovered.name).toEqual(pkg0.name);
                expect(pkg0recovered.directDeps).toEqual(pkg0.directDeps);
            });

            test('put two dependent packages with dependent agda code', async () => {
                // Create a package
                const pkg0 = await createPkg(
                    'Test0',
                    new Set<string>([]),
                    new Map<string, string>([
                        [
                            'Main.agda',
                            'module Test0.Main where\nopen import Agda.Builtin.Nat\nmyNat0 : Nat\nmyNat0 = 0',
                        ],
                    ]),
                );
                const pkg1 = await createPkg(
                    'Test1',
                    new Set<string>([pkg0.id]),
                    new Map<string, string>([
                        [
                            'Main.agda',
                            'module Test1.Main where\nopen import Agda.Builtin.Nat\nopen import Test0.Main\nmyNat1 : Nat\nmyNat1 = myNat0 + 1',
                        ],
                    ]),
                );

                // read the package bytes from file
                const pkg0Bytes = fs.readFileSync(pkg0.filePath);
                const pkg0B64 = pkg0Bytes.toString('base64');
                const pkg1Bytes = fs.readFileSync(pkg1.filePath);
                const pkg1B64 = pkg1Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
                expect(lsResult.size).toBe(0);

                // Put the package
                const result0 = await caller.put({
                    id: pkg0.id,
                    b64: pkg0B64,
                });
                const result1 = await caller.put({
                    id: pkg1.id,
                    b64: pkg1B64,
                });

                // Expect the id to be the same
                expect(result0.id).toEqual(pkg0.id);
                expect(result1.id).toEqual(pkg1.id);

                // Get the package from the registry
                const pkg0recovered = await registry.get(pkg0.id);
                const pkg1recovered = await registry.get(pkg1.id);

                // Expect the package to be the same
                expect(pkg0recovered.id).toEqual(pkg0.id);
                expect(pkg0recovered.name).toEqual(pkg0.name);
                expect(pkg0recovered.directDeps).toEqual(pkg0.directDeps);
                expect(pkg1recovered.id).toEqual(pkg1.id);
                expect(pkg1recovered.name).toEqual(pkg1.name);
                expect(pkg1recovered.directDeps).toEqual(pkg1.directDeps);
            });
        });
        describe('failure cases', () => {
            test('put with empty id should result in error', async () => {
                await expect(caller.put({ id: '', b64: '' })).rejects.toThrow(TRPCError);
            });

            test('put two dependent packages in the wrong order', async () => {
                // Create a package
                const pkg0 = await createPkg('test0', new Set<string>([]));
                const pkg1 = await createPkg('test1', new Set<string>([pkg0.id]));

                // read the package bytes from file
                const pkg1Bytes = fs.readFileSync(pkg1.filePath);
                const pkg1B64 = pkg1Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
                expect(lsResult.size).toBe(0);

                // Put the package (expect to reject)
                await expect(
                    caller.put({
                        id: pkg1.id,
                        b64: pkg1B64,
                    }),
                ).rejects.toThrow(TRPCError);

                // Expect the package to not be in the registry
                const lsResultEnd = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
                expect(lsResultEnd.size).toBe(0);
            });

            test('put malicious package (agda fails to typecheck)', async () => {
                // Create a package
                const pkg0 = await createPkg(
                    'Test',
                    new Set<string>([]),
                    new Map<string, string>([['Test/Main.agda', '']]),
                );

                // read the package bytes from file
                const pkg0Bytes = fs.readFileSync(pkg0.filePath);
                const pkg0B64 = pkg0Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id]));
                expect(lsResult.size).toBe(0);

                // Put the package (expect to reject)
                await expect(
                    caller.put({
                        id: pkg0.id,
                        b64: pkg0B64,
                    }),
                ).rejects.toThrow(TRPCError);

                // Expect the package to not be in the registry
                const lsResultEnd = await registry.ls(new Set<string>([pkg0.id]));
                expect(lsResultEnd.size).toBe(0);
            });

            test('put package with wrong id)', async () => {
                // Create a package
                const pkg0 = await createPkg('Test', new Set<string>([]), new Map<string, string>());

                // read the package bytes from file
                const pkg0Bytes = fs.readFileSync(pkg0.filePath);
                const pkg0B64 = pkg0Bytes.toString('base64');

                // Expect the packages to not be in the registry
                const registry = await Registry.getDefault();
                const lsResult = await registry.ls(new Set<string>([pkg0.id]));
                expect(lsResult.size).toBe(0);

                // Put the package (expect to reject)
                await expect(
                    caller.put({
                        id: 'wrongId',
                        b64: pkg0B64,
                    }),
                ).rejects.toThrow(TRPCError);

                // Expect the package to not be in the registry
                const lsResultEnd = await registry.ls(new Set<string>([pkg0.id, 'wrongId']));
                expect(lsResultEnd.size).toBe(0);
            });
        });
    });
});
