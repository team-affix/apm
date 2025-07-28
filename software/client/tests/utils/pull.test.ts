import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Package, Registry, Source } from '@team-affix/apm-common';
import { Remotes } from '../../src/models/remotes';

// Mock the function createTrpcClient
jest.mock('../../src/trpc/client', () => {
    const original = jest.requireActual('../../src/trpc/client');
    return {
        __esModule: true,
        ...original,
        createTrpcClient: jest.fn(),
    };
});

import { pull } from '../../src/utils/pull';
import { createTrpcClient } from '../../src/trpc/client';

const TEST_REMOTE_NAME = 'test';
const TEST_REMOTE_URL = 'https://example.com';

describe('pull', () => {
    // The temporary directory for the test case
    let testCaseDir: string;

    // The mock remote package base64s
    let mockRemoteRegistry: Registry;

    // The mock pull dependencies
    let mockResponsePullDependencies: string[];

    // The package IDs that our algorithm requested from the remote
    let requestedPackageIds: string[];

    beforeEach(async () => {
        // Construct the temporary directory for the test case
        testCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-client-tests'));

        // Create the mock default registry path
        const mockDefaultRegistryPath = path.join(testCaseDir, 'registry');

        // Create the mock default registry
        await Registry.create(mockDefaultRegistryPath);

        // Mock the default registry with one we control
        jest.spyOn(Registry, 'getDefault').mockResolvedValue(await Registry.load(mockDefaultRegistryPath));

        // Construct a remotes file that we control
        const remotesPath = path.join(testCaseDir, 'remotes.json');
        Remotes.create(remotesPath);
        const remotes = await Remotes.load(remotesPath);
        remotes.add(TEST_REMOTE_NAME, TEST_REMOTE_URL);
        await remotes.save();

        // Mock the Remotes.getDefault function
        jest.spyOn(Remotes, 'getDefault').mockReturnValue(remotes);

        // Create a mocked TRPC client
        const mockedTrpcClient = {
            getPullDependencies: {
                query: jest.fn().mockImplementation(async (args) => {
                    return {
                        pkgIds: mockResponsePullDependencies,
                    };
                }),
            },
            get: {
                query: jest.fn().mockImplementation(async (args) => {
                    if (typeof args !== 'object' || !args.id) throw new Error('id is required');
                    // Add the requested package ID to the list
                    requestedPackageIds.push(args.id);
                    // Get the package from the mock remote registry
                    const pkg = await mockRemoteRegistry.get(args.id);
                    // Read in the package file
                    const bytes = fs.readFileSync(pkg.filePath);
                    // Compute the base64
                    const b64 = bytes.toString('base64');
                    // Return the mock remote package base64
                    return {
                        b64,
                    };
                }),
            },
        };

        // Mock the function createTrpcClient
        (createTrpcClient as jest.Mock).mockImplementation((url) => {
            return mockedTrpcClient;
        });

        // Create the remote registry path
        const remoteRegistryPath = path.join(testCaseDir, 'remote-registry');

        // Create the remote registry
        mockRemoteRegistry = await Registry.create(remoteRegistryPath);

        // Initialize the structures for the next test
        mockResponsePullDependencies = [];
        requestedPackageIds = [];
    });

    afterEach(() => {
        // Clean up after each test
        jest.restoreAllMocks();
    });

    // // Creates a package in the default registry given:
    // //     - The package name
    // //     - The package dependencies
    // //     - The package's source files in a map of file paths to file contents
    // async function createAndRegister(
    //     name: string,
    //     deps: Set<string>,
    //     sourceFiles: Map<string, string> = new Map<string, string>(),
    // ): Promise<Package> {
    //     // create a temp directory for the package
    //     const pkgDir = fs.mkdtempSync(path.join(testCaseDir, 'package'));

    //     // Create a temporary directory for the package
    //     const sourceDir = path.join(pkgDir, 'source');
    //     await Source.create(sourceDir);

    //     // Create the package files
    //     for (const [filePath, fileContent] of sourceFiles.entries())
    //         fs.writeFileSync(path.join(sourceDir, filePath), fileContent);

    //     // Load the source
    //     const source = await Source.load(sourceDir);

    //     // Create the package
    //     const pkgPath = path.join(pkgDir, `pkg.apm`);
    //     const pkg = await Package.create(pkgPath, name, deps, source.getArchive());

    //     // Put the package in the registry
    //     const registry = await Registry.getDefault();
    //     await registry.put(pkg);

    //     // Return the package
    //     return pkg;
    // }

    // Creates a package in a temp folder and computes its base64,
    // then adds it to the mock remote package base64s
    async function createAndRegisterMockRemotePackage(
        name: string,
        deps: Set<string>,
        sourceFiles: Map<string, string> = new Map<string, string>(),
    ) {
        // create a temp directory for the package
        const pkgDir = fs.mkdtempSync(path.join(testCaseDir, 'package'));

        // Create a temporary directory for the package
        const sourceDir = path.join(pkgDir, 'source');
        await Source.create(sourceDir);

        // Create the package files
        for (const [filePath, fileContent] of sourceFiles.entries())
            fs.writeFileSync(path.join(sourceDir, filePath), fileContent);

        // Load the source
        const source = await Source.load(sourceDir);

        // Create the package
        const pkgPath = path.join(pkgDir, `pkg.apm`);
        const pkg = await Package.create(pkgPath, name, deps, source.getArchive());

        // Add the package to the mock remote registry
        await mockRemoteRegistry.put(pkg);

        // Return the package
        return pkg;
    }

    describe('success cases', () => {
        it('empty local registry, pull a package with no dependencies', async () => {
            // Create a mock remote package
            const pkg = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            // Add the package ID to the mock pull dependencies
            mockResponsePullDependencies = [pkg.id];
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg.id);
            // Verify that the correct get requests were made to the remote
            expect(requestedPackageIds).toEqual([pkg.id]);
            // Check that the package was pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg.id]));
            expect(pkgs.size).toBe(1);
            expect(pkgs.has(pkg.id)).toBe(true);
        });

        it('empty local registry, pull a package with one dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([pkg0.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id];
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg1.id);
            // Verify that the correct get requests were made to the remote
            expect(requestedPackageIds).toEqual([pkg0.id, pkg1.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg0.id, pkg1.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg1.id)).toBe(true);
        });

        it('empty local registry, pull a package with two dependencies', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id];
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg2.id);
            // Verify that the correct get requests were made to the remote
            expect(requestedPackageIds).toEqual([pkg0.id, pkg1.id, pkg2.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg0.id, pkg1.id, pkg2.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });

        it('empty local registry, pull a package with two direct dependencies and one indirect dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([pkg0.id]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id]));
            const pkg3 = await createAndRegisterMockRemotePackage('pkg3', new Set<string>([pkg0.id, pkg1.id, pkg2.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id, pkg3.id];
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg3.id);
            // Verify that the correct get requests were made to the remote
            expect(requestedPackageIds).toEqual([pkg0.id, pkg1.id, pkg2.id, pkg3.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg0.id, pkg1.id, pkg2.id, pkg3.id]));
            expect(pkgs.size).toBe(4);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
        });

        it('local registry has root package, root has no dependencies', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            // Add the package ID to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg0.id);
            // Verify that the correct get requests were made to the remote (empty since we already have the package)
            expect(requestedPackageIds).toEqual([]);
        });

        it('local registry has root package, root has one dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([pkg0.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            await localRegistry.put(pkg1);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg1.id);
            // Verify that the correct get requests were made to the remote (empty since we already have the package)
            expect(requestedPackageIds).toEqual([]);
        });

        it('local registry has root package, root has two dependencies', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            await localRegistry.put(pkg1);
            await localRegistry.put(pkg2);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg2.id);
            // Verify that the correct get requests were made to the remote (empty since we already have the package)
            expect(requestedPackageIds).toEqual([]);
        });

        it('root has one dependency, local registry has dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([pkg0.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg1.id);
            // Verify that the correct get requests were made to the remote (we already have pkg0)
            expect(requestedPackageIds).toEqual([pkg1.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg1.id]));
            expect(pkgs.size).toBe(1);
            expect(pkgs.has(pkg1.id)).toBe(true);
        });

        it('root has two dependencies, local registry has the first one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg2.id);
            // Verify that the correct get requests were made to the remote (we already have pkg0)
            expect(requestedPackageIds).toEqual([pkg1.id, pkg2.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg1.id, pkg2.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });

        it('root has two dependencies, local registry has the second one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg1);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg2.id);
            // Verify that the correct get requests were made to the remote (we already have pkg1)
            expect(requestedPackageIds).toEqual([pkg0.id, pkg2.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg0.id, pkg2.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });

        it('root has one direct, one indirect dependency, local registry has the indirect one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([pkg0.id]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg1.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg2.id);
            // Verify that the correct get requests were made to the remote (we already have pkg0)
            expect(requestedPackageIds).toEqual([pkg1.id, pkg2.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg1.id, pkg2.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });

        it('root has one direct, one indirect dependency, local registry has the direct one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([pkg0.id]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg1.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            await localRegistry.put(pkg1);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg2.id);
            // Verify that the correct get requests were made to the remote (we already have pkg0 and pkg1)
            expect(requestedPackageIds).toEqual([pkg2.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg2.id]));
            expect(pkgs.size).toBe(1);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });

        it('root has one direct, two indirect dependencies, local registry has the left indirect', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            const pkg3 = await createAndRegisterMockRemotePackage('pkg3', new Set<string>([pkg2.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id, pkg3.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg0);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg3.id);
            // Verify that the correct get requests were made to the remote (we already have pkg0)
            expect(requestedPackageIds).toEqual([pkg1.id, pkg2.id, pkg3.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg1.id, pkg2.id, pkg3.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
        });

        it('root has one direct, two indirect dependencies, local registry has the right indirect', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegisterMockRemotePackage('pkg0', new Set<string>());
            const pkg1 = await createAndRegisterMockRemotePackage('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegisterMockRemotePackage('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            const pkg3 = await createAndRegisterMockRemotePackage('pkg3', new Set<string>([pkg2.id]));
            // Add the package IDs to the mock pull dependencies
            mockResponsePullDependencies = [pkg0.id, pkg1.id, pkg2.id, pkg3.id];
            // Add the package to the local registry
            const localRegistry = await Registry.getDefault();
            await localRegistry.put(pkg1);
            // Pull the package
            await pull(TEST_REMOTE_NAME, pkg3.id);
            // Verify that the correct get requests were made to the remote (we already have pkg1)
            expect(requestedPackageIds).toEqual([pkg0.id, pkg2.id, pkg3.id]);
            // Check that the packages were pulled
            const registry = await Registry.getDefault();
            const pkgs = await registry.ls(new Set<string>([pkg0.id, pkg2.id, pkg3.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
        });
    });

    describe('failure cases', () => {});
});
