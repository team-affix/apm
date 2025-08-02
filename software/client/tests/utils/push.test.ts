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

import { push } from '../../src/utils/push';
import { createTrpcClient } from '../../src/trpc/client';

const TEST_REMOTE_NAME = 'test';
const TEST_REMOTE_URL = 'https://example.com';
const TEST_REMOTE_API_URL = 'https://example.com/api/trpc';

function getB64(pkg: Package): string {
    // Get the bytes from file
    const bytes = fs.readFileSync(pkg.filePath);
    // Compute the base64
    return bytes.toString('base64');
}

describe('push', () => {
    // The temporary directory for the test case
    let testCaseDir: string;

    // The mock remote package base64s
    let mockRemoteRegistry: Registry;

    // // The mock push dependencies
    // let mockResponseLsIds: string[];

    // The package IDs that our algorithm requested from the remote
    let putPackageArgs: { id: string; b64: string }[];

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

        // Create a temporary directory for the remote packages
        const remotePackageDir = path.join(testCaseDir, 'remote-package');
        fs.mkdirSync(remotePackageDir, { recursive: true });

        // Create a mocked TRPC client
        const mockedTrpcClient = {
            ls: {
                query: jest.fn().mockImplementation(async (args) => {
                    // get the ids array from the args
                    const ids = args.ids;
                    // get the packages from the mock remote registry
                    const present = await mockRemoteRegistry.ls(new Set<string>(ids));
                    // return the ids
                    return {
                        ids: Array.from(present),
                    };
                }),
            },
            put: {
                mutate: jest.fn().mockImplementation(async (args) => {
                    if (typeof args !== 'object') throw new Error('args is required');
                    if (typeof args.id !== 'string') throw new Error('id is required');
                    if (typeof args.b64 !== 'string') throw new Error('b64 is required');
                    // Add the requested package ID to the list
                    putPackageArgs.push(args);
                    // Get the bytes from the base64
                    const bytes = Buffer.from(args.b64, 'base64');
                    // Write the package to file
                    const pkgPath = path.join(remotePackageDir, args.id);
                    fs.writeFileSync(pkgPath, bytes);
                    // Load the package from file
                    const pkg = await Package.load(pkgPath);
                    // Put the package in the mock remote registry
                    await mockRemoteRegistry.put(pkg, args.id);
                    // Return the package ID
                    return {
                        id: args.id,
                    };
                }),
            },
        };

        // Mock the function createTrpcClient
        (createTrpcClient as jest.Mock).mockImplementation((apiUrl) => {
            expect(apiUrl).toBe(TEST_REMOTE_API_URL);
            return mockedTrpcClient;
        });

        // Create the remote registry path
        const remoteRegistryPath = path.join(testCaseDir, 'remote-registry');

        // Create the remote registry
        mockRemoteRegistry = await Registry.create(remoteRegistryPath);

        // Initialize the structures for the next test
        // mockResponseLsIds = [];
        putPackageArgs = [];
    });

    afterEach(() => {
        // Clean up after each test
        jest.restoreAllMocks();
    });

    // Creates a package in the default registry given:
    //     - The package name
    //     - The package dependencies
    //     - The package's source files in a map of file paths to file contents
    async function createAndRegister(
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
        for (const [filePath, fileContent] of sourceFiles.entries())
            fs.writeFileSync(path.join(sourceDir, filePath), fileContent);

        // Load the source
        const source = await Source.load(sourceDir);

        // Create the package
        const pkgPath = path.join(pkgDir, `pkg.apm`);
        const pkg = await Package.create(pkgPath, name, deps, source.getArchive());

        // Put the package in the registry
        const registry = await Registry.getDefault();
        await registry.put(pkg);

        // Return the package
        return pkg;
    }

    // // Creates a package in a temp folder and computes its base64,
    // // then adds it to the mock remote package base64s
    // async function createAndRegisterMockRemotePackage(
    //     name: string,
    //     deps: Set<string>,
    //     sourceFiles: Map<string, string> = new Map<string, string>(),
    // ) {
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

    //     // Add the package to the mock remote registry
    //     await mockRemoteRegistry.put(pkg);

    //     // Return the package
    //     return pkg;
    // }

    describe('success cases', () => {
        it('empty remote registry, push a package with no dependencies', async () => {
            // Create a mock local package
            const pkg = await createAndRegister('pkg0', new Set<string>());
            // Compute the base64
            const b64 = getB64(pkg);
            // The response to ls should be empty
            // mockResponseLsIds = [];
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg.id);
            // Verify that the correct put requests were made to the remote
            expect(putPackageArgs).toEqual([{ id: pkg.id, b64 }]);
            // Check that the package was pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg.id]));
            expect(pkgs.size).toBe(1);
            expect(pkgs.has(pkg.id)).toBe(true);
        });
        it('empty remote registry, push a package with one dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([pkg0.id]));
            // Compute the base64s
            const b640 = getB64(pkg0);
            const b641 = getB64(pkg1);
            // The response to ls should be empty
            // mockResponseLsIds = [];
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg1.id);
            // Verify that the correct put requests were made to the remote
            expect(putPackageArgs).toEqual([
                { id: pkg0.id, b64: b640 },
                { id: pkg1.id, b64: b641 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg0.id, pkg1.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg1.id)).toBe(true);
        });
        it('empty remote registry, push a package with two dependencies', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Compute the base64s
            const b640 = getB64(pkg0);
            const b641 = getB64(pkg1);
            const b642 = getB64(pkg2);
            // The response to ls should be empty
            // mockResponseLsIds = [];
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg2.id);
            // Verify that the correct put requests were made to the remote
            expect(putPackageArgs).toEqual([
                { id: pkg0.id, b64: b640 },
                { id: pkg1.id, b64: b641 },
                { id: pkg2.id, b64: b642 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg0.id, pkg1.id, pkg2.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });
        it('empty remote registry, push a package with two direct dependencies and one indirect dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([pkg0.id]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id]));
            const pkg3 = await createAndRegister('pkg3', new Set<string>([pkg0.id, pkg1.id, pkg2.id]));
            // Compute the base64s
            const b640 = getB64(pkg0);
            const b641 = getB64(pkg1);
            const b642 = getB64(pkg2);
            const b643 = getB64(pkg3);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg3.id);
            // Verify that the correct put requests were made to the remote
            expect(putPackageArgs).toEqual([
                { id: pkg0.id, b64: b640 },
                { id: pkg1.id, b64: b641 },
                { id: pkg2.id, b64: b642 },
                { id: pkg3.id, b64: b643 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg0.id, pkg1.id, pkg2.id, pkg3.id]));
            expect(pkgs.size).toBe(4);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
        });
        it('remote registry has root package, root has no dependencies', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            // Add the package to the remote registry
            await mockRemoteRegistry.put(pkg0);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg0.id);
            // Verify that the correct put requests were made to the remote (empty since we already have the package)
            expect(putPackageArgs).toEqual([]);
        });
        it('remote registry has root package, root has one dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([pkg0.id]));
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            await mockRemoteRegistry.put(pkg1);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg1.id);
            // Verify that the correct put requests were made to the remote (empty since we already have the package)
            expect(putPackageArgs).toEqual([]);
        });
        it('remote registry has root package, root has two dependencies', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            await mockRemoteRegistry.put(pkg1);
            await mockRemoteRegistry.put(pkg2);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg2.id);
            // Verify that the correct put requests were made to the remote (empty since we already have the package)
            expect(putPackageArgs).toEqual([]);
        });
        it('root has one dependency, remote registry has dependency', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([pkg0.id]));
            // Compute the base64
            const b641 = getB64(pkg1);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg1.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0)
            expect(putPackageArgs).toEqual([{ id: pkg1.id, b64: b641 }]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg1.id]));
            expect(pkgs.size).toBe(1);
            expect(pkgs.has(pkg1.id)).toBe(true);
        });
        it('root has two dependencies, remote registry has the first one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Compute the base64s
            const b641 = getB64(pkg1);
            const b642 = getB64(pkg2);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg2.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0)
            expect(putPackageArgs).toEqual([
                { id: pkg1.id, b64: b641 },
                { id: pkg2.id, b64: b642 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg1.id, pkg2.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });
        it('root has two dependencies, remote registry has the second one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            // Compute the base64s
            const b640 = getB64(pkg0);
            const b642 = getB64(pkg2);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg1);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg2.id);
            // Verify that the correct put requests were made to the remote (we already have pkg1)
            expect(putPackageArgs).toEqual([
                { id: pkg0.id, b64: b640 },
                { id: pkg2.id, b64: b642 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg0.id, pkg2.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });
        it('root has one direct, one indirect dependency, remote registry has the indirect one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([pkg0.id]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg1.id]));
            // Compute the base64s
            const b641 = getB64(pkg1);
            const b642 = getB64(pkg2);
            // Add the package to the remote registry
            await mockRemoteRegistry.put(pkg0);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg2.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0)
            expect(putPackageArgs).toEqual([
                { id: pkg1.id, b64: b641 },
                { id: pkg2.id, b64: b642 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg1.id, pkg2.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });
        it('root has one direct, one indirect dependency, remote registry has the direct one', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([pkg0.id]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg1.id]));
            // Compute the base64s
            const b642 = getB64(pkg2);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            await mockRemoteRegistry.put(pkg1);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg2.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0 and pkg1)
            expect(putPackageArgs).toEqual([{ id: pkg2.id, b64: b642 }]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg2.id]));
            expect(pkgs.size).toBe(1);
            expect(pkgs.has(pkg2.id)).toBe(true);
        });
        it('root has one direct, two indirect dependencies, remote registry has the left indirect', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            const pkg3 = await createAndRegister('pkg3', new Set<string>([pkg2.id]));
            // Compute the base64s
            const b641 = getB64(pkg1);
            const b642 = getB64(pkg2);
            const b643 = getB64(pkg3);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg3.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0)
            expect(putPackageArgs).toEqual([
                { id: pkg1.id, b64: b641 },
                { id: pkg2.id, b64: b642 },
                { id: pkg3.id, b64: b643 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg1.id, pkg2.id, pkg3.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
        });
        it('root has one direct, two indirect dependencies, remote registry has the right indirect', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>([]));
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id, pkg1.id]));
            const pkg3 = await createAndRegister('pkg3', new Set<string>([pkg2.id]));
            // Compute the base64s
            const b640 = getB64(pkg0);
            const b642 = getB64(pkg2);
            const b643 = getB64(pkg3);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg1);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg3.id);
            // Verify that the correct put requests were made to the remote (we already have pkg1)
            expect(putPackageArgs).toEqual([
                { id: pkg0.id, b64: b640 },
                { id: pkg2.id, b64: b642 },
                { id: pkg3.id, b64: b643 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg0.id, pkg2.id, pkg3.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg0.id)).toBe(true);
            expect(pkgs.has(pkg2.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
        });
        it('root has two direct, each with one indirect dependency, remote registry has the left direct dep', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>());
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id]));
            const pkg3 = await createAndRegister('pkg3', new Set<string>([pkg1.id]));
            const pkg4 = await createAndRegister('pkg4', new Set<string>([pkg2.id, pkg3.id]));
            // Compute the base64s
            const b641 = getB64(pkg1);
            const b643 = getB64(pkg3);
            const b644 = getB64(pkg4);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            await mockRemoteRegistry.put(pkg2);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg4.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0 and pkg2)
            expect(putPackageArgs).toEqual([
                { id: pkg1.id, b64: b641 },
                { id: pkg3.id, b64: b643 },
                { id: pkg4.id, b64: b644 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg1.id, pkg3.id, pkg4.id]));
            expect(pkgs.size).toBe(3);
            expect(pkgs.has(pkg1.id)).toBe(true);
            expect(pkgs.has(pkg3.id)).toBe(true);
            expect(pkgs.has(pkg4.id)).toBe(true);
        });
        it('root has two direct, each with one indirect dependency, remote registry has the left direct dep and right indirect dep', async () => {
            // Create mock remote packages
            const pkg0 = await createAndRegister('pkg0', new Set<string>());
            const pkg1 = await createAndRegister('pkg1', new Set<string>());
            const pkg2 = await createAndRegister('pkg2', new Set<string>([pkg0.id]));
            const pkg3 = await createAndRegister('pkg3', new Set<string>([pkg1.id]));
            const pkg4 = await createAndRegister('pkg4', new Set<string>([pkg2.id, pkg3.id]));
            // Compute the base64s
            const b643 = getB64(pkg3);
            const b644 = getB64(pkg4);
            // Add the packages to the remote registry
            await mockRemoteRegistry.put(pkg0);
            await mockRemoteRegistry.put(pkg2);
            await mockRemoteRegistry.put(pkg1);
            // Push the package
            await push(TEST_REMOTE_API_URL, pkg4.id);
            // Verify that the correct put requests were made to the remote (we already have pkg0, pkg1, and pkg2)
            expect(putPackageArgs).toEqual([
                { id: pkg3.id, b64: b643 },
                { id: pkg4.id, b64: b644 },
            ]);
            // Check that the packages were pushed
            const pkgs = await mockRemoteRegistry.ls(new Set<string>([pkg3.id, pkg4.id]));
            expect(pkgs.size).toBe(2);
            expect(pkgs.has(pkg3.id)).toBe(true);
            expect(pkgs.has(pkg4.id)).toBe(true);
        });
    });

    describe('failure cases', () => {
        it('push a package that does not exist', async () => {
            // Try to push the package, but expect an error
            await expect(push(TEST_REMOTE_API_URL, 'does-not-exist')).rejects.toThrow();
        });
    });
});
