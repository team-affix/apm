import path from 'path';
import os from 'os';
import fs from 'fs';
import { glob } from 'glob';
import debug from 'debug';
import { expect, describe, it, beforeEach } from '@jest/globals';
import tarFs from 'tar-fs';
import { pipeline } from 'stream/promises';
import { __test__ as PackageTest, Package } from '../../src/models/package';
// import { __test__ as SourceTest } from '../../src/models/source';
import FailedToDeserializeDepsError from '../../src/errors/failed-to-deserialize-deps';
import PackageLoadError from '../../src/errors/package-load';
import { Readable } from 'stream';
import PackageCreateError from '../../src/errors/package-create';

describe('models/package', () => {
    // HELPER FUNCTIONS
    describe('Package.serializeDirectDeps()', () => {
        it('should serialize with zero entries', () => {
            const deps = new Set<string>();
            const serialized = PackageTest.serializeDirectDeps(deps);
            expect(serialized).toBe('[]');
        });

        it('should serialize with one entry', () => {
            const deps = new Set<string>(['ver0']);
            const serialized = PackageTest.serializeDirectDeps(deps);
            expect(serialized).toBe('["ver0"]');
        });

        it('should serialize correctly with 2 entries', () => {
            const deps = new Set<string>(['ver0', 'ver1']);
            const serialized = PackageTest.serializeDirectDeps(deps);
            expect(serialized).toBe('["ver0","ver1"]');
        });

        it('should serialize correctly with many entries', () => {
            const deps = new Set<string>([
                'ver0',
                'ver1',
                'ver2',
                'ver3',
                'ver4',
                'ver5',
                'ver6',
                'ver7',
                'ver8',
                'ver9',
                'ver10',
                'ver11',
                'ver12',
                'ver13',
                'ver14',
                'ver15',
            ]);

            const serialized = PackageTest.serializeDirectDeps(deps);
            expect(serialized).toBe(
                '["ver0","ver1","ver2","ver3","ver4","ver5","ver6","ver7","ver8","ver9","ver10","ver11","ver12","ver13","ver14","ver15"]',
            );
        });
    });

    describe('Package.deserializeDirectDeps()', () => {
        describe('success cases', () => {
            it('should deserialize correctly with zero entries', () => {
                const serialized = '[]';
                const deps = PackageTest.deserializeDirectDeps(serialized);
                expect(deps).toEqual(new Set<string>());
            });

            it('should deserialize correctly with one entry', () => {
                const serialized = '["ver0"]';
                const deps = PackageTest.deserializeDirectDeps(serialized);
                expect(deps).toEqual(new Set<string>(['ver0']));
            });

            it('should deserialize correctly with many entries', () => {
                const serialized =
                    '["ver0","ver1","ver2","ver3","ver4","ver5","ver6","ver7","ver8","ver9","ver10","ver11","ver12","ver13","ver14","ver15"]';
                const deps = PackageTest.deserializeDirectDeps(serialized);
                expect(deps).toEqual(
                    new Set<string>([
                        'ver0',
                        'ver1',
                        'ver2',
                        'ver3',
                        'ver4',
                        'ver5',
                        'ver6',
                        'ver7',
                        'ver8',
                        'ver9',
                        'ver10',
                        'ver11',
                        'ver12',
                        'ver13',
                        'ver14',
                        'ver15',
                    ]),
                );
            });
        });

        describe('failure cases', () => {
            it('should throw a FailedToDeserializeDepsError if the string is empty', () => {
                const serialized = '';
                expect(() => PackageTest.deserializeDirectDeps(serialized)).toThrow(FailedToDeserializeDepsError);
            });

            it('should throw a FailedToDeserializeDepsError if the string is not valid JSON', () => {
                const serialized = 'invalid';
                expect(() => PackageTest.deserializeDirectDeps(serialized)).toThrow(FailedToDeserializeDepsError);
            });

            it('should throw a FailedToDeserializeDepsError if the string is not valid JSON (missing a closing brace)', () => {
                const serialized = '["ver0"';
                expect(() => PackageTest.deserializeDirectDeps(serialized)).toThrow(FailedToDeserializeDepsError);
            });

            it('should throw a FailedToDeserializeDepsError if the string is not valid JSON (missing an opening brace)', () => {
                const serialized = '"ver0"]';
                expect(() => PackageTest.deserializeDirectDeps(serialized)).toThrow(FailedToDeserializeDepsError);
            });

            it('should throw a FailedToDeserializeDepsError if the string is not valid JSON (missing a comma)', () => {
                const serialized = '["ver0" "ver1"]';
                expect(() => PackageTest.deserializeDirectDeps(serialized)).toThrow(FailedToDeserializeDepsError);
            });
        });
    });

    // describe('Package.computeBinary()', () => {
    //     // const produceDesiredBinary = (name: string, deps: Map<string, string>, payload: Buffer) => {
    //     //     // Create the chunks
    //     //     const chunks: Buffer[] = [];

    //     //     // Write the name length
    //     //     const nameLengthBuf = Buffer.alloc(4);
    //     //     nameLengthBuf.writeUInt32LE(name.length, 0);
    //     //     chunks.push(nameLengthBuf);

    //     //     // Write the name
    //     //     chunks.push(Buffer.from(name));

    //     //     // Write the dependencies length
    //     //     const depsLengthBuf = Buffer.alloc(4);
    //     //     depsLengthBuf.writeUInt32LE(depsSerialized.length, 0);
    //     //     chunks.push(depsLengthBuf);

    //     //     // Write the dependencies
    //     //     chunks.push(Buffer.from(depsSerialized));

    //     //     // Write the payload
    //     // };

    //     describe('success cases', () => {
    //         it('should compute the binary correctly for zero dependencies', () => {
    //             const name = 'PKG';
    //             const deps = new Map();
    //             const payload = Buffer.from([0xff]);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '03000000'; // Name length
    //             desiredHex += '504b47'; // Name
    //             desiredHex += '02000000'; // Dependencies length
    //             desiredHex += '7b7d'; // Dependencies
    //             desiredHex += 'ff'; // Payload

    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });

    //         it('should compute the binary correctly for one dependency', () => {
    //             const name = 'PKG';
    //             const deps = new Map([['dep0', 'ver0']]);
    //             const payload = Buffer.from([0xff]);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '03000000'; // Name length
    //             desiredHex += '504b47'; // Name
    //             desiredHex += '0f000000'; // Dependencies length
    //             desiredHex += '7b2264657030223a2276657230227d'; // Dependencies
    //             desiredHex += 'ff'; // Payload

    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });

    //         it('should compute the binary correctly for empty name and zero dependenciess', () => {
    //             const name = '';
    //             const deps = new Map();
    //             const payload = Buffer.from([0xff]);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '00000000'; // Name length
    //             desiredHex += ''; // Name
    //             desiredHex += '02000000'; // Dependencies length
    //             desiredHex += '7b7d'; // Dependencies
    //             desiredHex += 'ff'; // Payload

    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });

    //         it('should compute the binary correctly for empty name, zero dependencies, and large payload', () => {
    //             const name = '';
    //             const deps = new Map();
    //             const payload = Buffer.alloc(1000);
    //             payload.fill(0xff);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '00000000'; // Name length
    //             desiredHex += ''; // Name
    //             desiredHex += '02000000'; // Dependencies length
    //             desiredHex += '7b7d'; // Dependencies
    //             desiredHex += 'ff'.repeat(1000); // Payload

    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });

    //         it('should compute the binary correctly for empty name, one dependency, and large payload', () => {
    //             const name = '';
    //             const deps = new Map([['dep0', 'ver0']]);
    //             const payload = Buffer.alloc(1000);
    //             payload.fill(0xff);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '00000000'; // Name length
    //             desiredHex += ''; // Name
    //             desiredHex += '0f000000'; // Dependencies length
    //             desiredHex += '7b2264657030223a2276657230227d'; // Dependencies
    //             desiredHex += 'ff'.repeat(1000); // Payload

    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });

    //         it('should compute the binary correctly for long name, one dependency, and large payload', () => {
    //             const name = 'PKG_WITH_A_LONG_NAME_THAT_EXCEEDS_ALL_EXPECTATIONS_AND_THAT_IS_REALLY_LONG';
    //             const deps = new Map([['dep0', 'ver0']]);
    //             const payload = Buffer.alloc(1000);
    //             payload.fill(0xff);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '4a000000'; // Name length
    //             desiredHex +=
    //                 '504b475F574954485F415F4C4F4E475F4E414D455F544841545F455843454544535F414C4C5F4558504543544154494F4E535F414E445F544841545F49535F5245414C4C595F4C4F4E47'.toLowerCase(); // Name
    //             desiredHex += '0f000000'; // Dependencies length
    //             desiredHex += '7b2264657030223a2276657230227d'; // Dependencies
    //             desiredHex += 'ff'.repeat(1000); // Payload

    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });

    //         it('should compute the binary correctly for long name, many dependencies, and large payload', () => {
    //             const name = 'PKG_WITH_A_LONG_NAME_THAT_EXCEEDS_ALL_EXPECTATIONS_AND_THAT_IS_REALLY_LONG';
    //             const deps = new Map([
    //                 ['dep0', 'ver0'],
    //                 ['dep1', 'ver1'],
    //                 ['dep2', 'ver2'],
    //                 ['dep3', 'ver3'],
    //                 ['dep4', 'ver4'],
    //                 ['dep5', 'ver5'],
    //                 ['dep6', 'ver6'],
    //                 ['dep7', 'ver7'],
    //                 ['dep8', 'ver8'],
    //                 ['dep9', 'ver9'],
    //                 ['dep10', 'ver10'],
    //                 ['dep11', 'ver11'],
    //                 ['dep12', 'ver12'],
    //                 ['dep13', 'ver13'],
    //                 ['dep14', 'ver14'],
    //                 ['dep15', 'ver15'],
    //                 ['dep16', 'ver16'],
    //                 ['dep17', 'ver17'],
    //                 ['dep18', 'ver18'],
    //                 ['dep19', 'ver19'],
    //                 ['dep20', 'ver20'],
    //                 ['dep21', 'ver21'],
    //                 ['dep22', 'ver22'],
    //                 ['dep23', 'ver23'],
    //                 ['dep24', 'ver24'],
    //                 ['dep25', 'ver25'],
    //                 ['dep26', 'ver26'],
    //                 ['dep27', 'ver27'],
    //                 ['dep28', 'ver28'],
    //                 ['dep29', 'ver29'],
    //                 ['dep30', 'ver30'],
    //                 ['dep31', 'ver31'],
    //                 ['dep32', 'ver32'],
    //                 ['dep33', 'ver33'],
    //                 ['dep34', 'ver34'],
    //             ]);
    //             const payload = Buffer.alloc(1000);
    //             payload.fill(0xff);

    //             // Compute the binary
    //             const binary = PackageTest.computeBinary(name, deps, payload);

    //             // Compute the hex
    //             const hex = binary.toString('hex');

    //             let desiredHex = '';
    //             desiredHex += '4a000000'; // Name length
    //             desiredHex +=
    //                 '504b475f574954485f415f4c4f4e475f4e414d455f544841545f455843454544535f414c4c5f4558504543544154494f4e535f414e445f544841545f49535f5245414c4c595f4c4f4e47'.toLowerCase(); // Name
    //             desiredHex += '1d020000'; // Dependencies length
    //             desiredHex +=
    //                 '7b2264657030223a2276657230222c2264657031223a2276657231222c2264657032223a2276657232222c2264657033223a2276657233222c2264657034223a2276657234222c2264657035223a2276657235222c2264657036223a2276657236222c2264657037223a2276657237222c2264657038223a2276657238222c2264657039223a2276657239222c226465703130223a227665723130222c226465703131223a227665723131222c226465703132223a227665723132222c226465703133223a227665723133222c226465703134223a227665723134222c226465703135223a227665723135222c226465703136223a227665723136222c226465703137223a227665723137222c226465703138223a227665723138222c226465703139223a227665723139222c226465703230223a227665723230222c226465703231223a227665723231222c226465703232223a227665723232222c226465703233223a227665723233222c226465703234223a227665723234222c226465703235223a227665723235222c226465703236223a227665723236222c226465703237223a227665723237222c226465703238223a227665723238222c226465703239223a227665723239222c226465703330223a227665723330222c226465703331223a227665723331222c226465703332223a227665723332222c226465703333223a227665723333222c226465703334223a227665723334227d'; // Dependencies
    //             desiredHex += 'ff'.repeat(1000); // Payload
    //             // Check the result
    //             expect(hex).toEqual(desiredHex);
    //         });
    //     });
    // });

    describe('Package.computeId()', () => {
        const genericTest = async (name: string, binary: Buffer, expectedId: string) => {
            // Create a readable stream from the binary
            const stream = Readable.from(binary);
            // Compute the id
            const id = await PackageTest.computeId(name, stream);
            expect(id).toBe(`${name}@${expectedId}`);
        };

        it('should compute the id correctly for small binary', () =>
            genericTest(
                'name',
                Buffer.from([0x01, 0x02, 0x03, 0x04]),
                '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
            ));

        it('should compute the id correctly for medium binary', () =>
            genericTest(
                'Calculus',
                Buffer.from([
                    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                ]),
                '5dfbabeedf318bf33c0927c43d7630f51b82f351740301354fa3d7fc51f0132e',
            ));

        it('should compute the id correctly for large binary', () =>
            genericTest(
                'RealWorld',
                Buffer.from([
                    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
                    0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30,
                    0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40,
                    0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f,
                ]),
                'ce266517af1f9b2272e176703395a24fe91eba54fef1c05a9c57c2a215b182b6',
            ));
    });

    // describe('Package.load()', () => {
    //     const tmpRegistryPath = path.join(os.tmpdir(), 'tmp-registry');

    //     beforeEach(() => {
    //         // Remove the temporary registry if it exists
    //         if (fs.existsSync(tmpRegistryPath)) fs.rmSync(tmpRegistryPath, { recursive: true, force: true });

    //         // Create the temporary registry
    //         fs.mkdirSync(tmpRegistryPath, { recursive: true });
    //     });

    //     describe('success cases', () => {
    //         const genericTest = async (pkgName: string, deps: Map<string, string>, payload: Buffer) => {
    //             // Get the debugger
    //             const dbg = debug('apm:common:tests:models:Package:load');

    //             // Construct the package path
    //             const pkgPath = path.join(tmpRegistryPath, `test.apm`);

    //             // If the file already exists, remove it
    //             if (fs.existsSync(pkgPath)) fs.unlinkSync(pkgPath);

    //             // Print the binary
    //             dbg(`Binary: ${binary.toString('hex')}`);

    //             // Get the id of the package
    //             const id = PackageTest.computeId(binary);

    //             // Print the id
    //             dbg(`Id: ${id}`);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, binary);

    //             // Find the package
    //             const pkg = await Package.load(pkgPath);

    //             expect(pkg).toBeInstanceOf(Package);

    //             expect(pkg.getName()).toBe(pkgName);
    //             expect(pkg.getDirectDeps()).toEqual(deps);
    //             expect(pkg.getId()).toBe(id);
    //             expect(pkg.getPayload()).toEqual(payload);
    //         };

    //         it('4-char name, 3 dependencies, 1-byte payload', () =>
    //             genericTest(
    //                 'name',
    //                 new Map([
    //                     ['dep0', '1.0.0'],
    //                     ['dep1', '1.0.1'],
    //                     ['dep2', '1.0.2'],
    //                 ]),
    //                 Buffer.from([0xff]),
    //             ));

    //         it('no dependencies', () => genericTest('name', new Map(), Buffer.from([0xff])));

    //         it('many dependencies', () =>
    //             genericTest(
    //                 'name',
    //                 new Map([
    //                     ['dep0', '1.0.0'],
    //                     ['dep1', '1.0.1'],
    //                     ['dep2', '1.0.2'],
    //                     ['dep3', '1.0.3'],
    //                     ['dep4', '1.0.4'],
    //                     ['dep5', '1.0.5'],
    //                     ['dep6', '1.0.6'],
    //                     ['dep7', '1.0.7'],
    //                     ['dep8', '1.0.8'],
    //                     ['dep9', '1.0.9'],
    //                     ['dep10', '1.0.10'],
    //                     ['dep11', '1.0.11'],
    //                     ['dep12', '1.0.12'],
    //                     ['dep13', '1.0.13'],
    //                     ['dep14', '1.0.14'],
    //                     ['dep15', '1.0.15'],
    //                     ['dep16', '1.0.16'],
    //                     ['dep17', '1.0.17'],
    //                     ['dep18', '1.0.18'],
    //                     ['dep19', '1.0.19'],
    //                     ['dep20', '1.0.20'],
    //                     ['dep21', '1.0.21'],
    //                     ['dep22', '1.0.22'],
    //                     ['dep23', '1.0.23'],
    //                     ['dep24', '1.0.24'],
    //                     ['dep25', '1.0.25'],
    //                     ['dep26', '1.0.26'],
    //                     ['dep27', '1.0.27'],
    //                     ['dep28', '1.0.28'],
    //                 ]),
    //                 Buffer.from([0xff]),
    //             ));

    //         it('no dependencies and a long name', () =>
    //             genericTest('name'.repeat(100), new Map(), Buffer.from([0xff])));

    //         it('no dependencies and a huge payload', () =>
    //             genericTest('name', new Map(), Buffer.from(new Uint8Array(10000))));

    //         it('long name, many dependencies and a huge payload', () =>
    //             genericTest(
    //                 'name'.repeat(100),
    //                 new Map([
    //                     ['dep0', '1.0.0'],
    //                     ['dep1', '1.0.1'],
    //                     ['dep2', '1.0.2'],
    //                     ['dep3', '1.0.3'],
    //                     ['dep4', '1.0.4'],
    //                     ['dep5', '1.0.5'],
    //                     ['dep6', '1.0.6'],
    //                     ['dep7', '1.0.7'],
    //                     ['dep8', '1.0.8'],
    //                     ['dep9', '1.0.9'],
    //                     ['dep10', '1.0.10'],
    //                     ['dep11', '1.0.11'],
    //                     ['dep12', '1.0.12'],
    //                     ['dep13', '1.0.13'],
    //                 ]),
    //                 Buffer.from(new Uint8Array(10000)),
    //             ));
    //     });

    //     describe('failure cases', () => {
    //         it('Package.load() should throw PackageLoadError if the path does not exist', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'does-not-exist.apm');
    //             // it rejects
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageNotFoundError if the path is a directory', async () => {
    //             const dirPath = path.join(tmpRegistryPath, 'dir');

    //             // Create the directory
    //             fs.mkdirSync(dirPath, { recursive: true });

    //             // Expect the directory to exist
    //             expect(fs.existsSync(dirPath)).toBe(true);

    //             // Expect the package to not be found
    //             await expect(Package.load(dirPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageLoadError if the package is too short to contain a name length', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'too-short-name-length.apm');

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.from([]));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageLoadError if the package name length is nonzero but the name is empty', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'too-short-name.apm');

    //             // Create binary
    //             const chunks: Buffer[] = [];

    //             // Add the name length
    //             const nameLengthBuf = Buffer.alloc(4);
    //             nameLengthBuf.writeUInt32LE(1, 0);
    //             chunks.push(nameLengthBuf);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.concat(chunks));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageLoadError if the package name is smaller than the designated name length', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'too-short-name.apm');

    //             // Create binary
    //             const chunks: Buffer[] = [];

    //             // Add the name length
    //             const nameLengthBuf = Buffer.alloc(4);
    //             nameLengthBuf.writeUInt32LE(5, 0);
    //             chunks.push(nameLengthBuf);

    //             // Add the name
    //             const nameBuf = Buffer.from('name');
    //             chunks.push(nameBuf);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.concat(chunks));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageLoadError if the package dependencies length is missing', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'missing-deps-length.apm');

    //             // Create binary
    //             const chunks: Buffer[] = [];

    //             // Add the name length
    //             const nameLengthBuf = Buffer.alloc(4);
    //             nameLengthBuf.writeUInt32LE(4, 0);
    //             chunks.push(nameLengthBuf);

    //             // Add the name
    //             const nameBuf = Buffer.from('name');
    //             chunks.push(nameBuf);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.concat(chunks));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageLoadError if the package dependencies are missing', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'missing-deps.apm');

    //             // Create binary
    //             const chunks: Buffer[] = [];

    //             // Add the name length
    //             const nameLengthBuf = Buffer.alloc(4);
    //             nameLengthBuf.writeUInt32LE(4, 0);
    //             chunks.push(nameLengthBuf);

    //             // Add the name
    //             const nameBuf = Buffer.from('name');
    //             chunks.push(nameBuf);

    //             // Add the dependencies length
    //             const depsLengthBuf = Buffer.alloc(4);
    //             depsLengthBuf.writeUInt32LE(2, 0);
    //             chunks.push(depsLengthBuf);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.concat(chunks));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw PackageLoadError if the package dependencies are smaller than the designated dependencies length', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'too-short-deps.apm');

    //             // Create binary
    //             const chunks: Buffer[] = [];

    //             // Add the name length
    //             const nameLengthBuf = Buffer.alloc(4);
    //             nameLengthBuf.writeUInt32LE(4, 0);
    //             chunks.push(nameLengthBuf);

    //             // Add the name
    //             const nameBuf = Buffer.from('name');
    //             chunks.push(nameBuf);

    //             // Add the dependencies length
    //             const depsLengthBuf = Buffer.alloc(4);
    //             depsLengthBuf.writeUInt32LE(3, 0);
    //             chunks.push(depsLengthBuf);

    //             // Add the dependencies
    //             const depsBuf = Buffer.from('{}');
    //             chunks.push(depsBuf);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.concat(chunks));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(PackageLoadError);
    //         });

    //         it('Package.load() should throw FailedToDeserializeDepsError if the package dependencies are not a valid JSON object', async () => {
    //             const pkgPath = path.join(tmpRegistryPath, 'invalid-deps.apm');

    //             // Create binary
    //             const chunks: Buffer[] = [];

    //             // Add the name length
    //             const nameLengthBuf = Buffer.alloc(4);
    //             nameLengthBuf.writeUInt32LE(4, 0);
    //             chunks.push(nameLengthBuf);

    //             // Add the name
    //             const nameBuf = Buffer.from('name');
    //             chunks.push(nameBuf);

    //             // Add the dependencies length
    //             const depsLengthBuf = Buffer.alloc(4);
    //             depsLengthBuf.writeUInt32LE(1, 0);
    //             chunks.push(depsLengthBuf);

    //             // Add the dependencies
    //             const depsBuf = Buffer.from('{');
    //             chunks.push(depsBuf);

    //             // Create the package file
    //             fs.writeFileSync(pkgPath, Buffer.concat(chunks));

    //             // Expect the package to not be found
    //             await expect(Package.load(pkgPath)).rejects.toThrow(FailedToDeserializeDepsError);
    //         });
    //     });
    // });

    describe('Package.create() and Package.load()', () => {
        const packDir = path.join(os.tmpdir(), 'apm-pack');
        const extractDir = path.join(os.tmpdir(), 'apm-extract');
        const packageFilePath = path.join(os.tmpdir(), 'package.apm');

        beforeEach(() => {
            // Remove the temporary files if they exist
            if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true, force: true });
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            if (fs.existsSync(packageFilePath)) fs.rmSync(packageFilePath, { force: true });

            // Create the temporary directory
            fs.mkdirSync(packDir, { recursive: true });
            fs.mkdirSync(extractDir, { recursive: true });
        });

        const writeFileInside = (relPath: string, content: string) => {
            // Write the file inside the temporary directory
            const filePath = path.join(packDir, relPath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        };

        const writeFilesInside = (entries: Map<string, string>) => {
            for (const [relPath, content] of entries) writeFileInside(relPath, content);
        };

        const assertFileInside = (relPath: string, content: string) => {
            const filePath = path.join(extractDir, relPath);
            expect(fs.existsSync(filePath)).toBe(true);
            expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
        };

        const assertFilesMatchExactly = (entries: Map<string, string>) => {
            for (const [relPath, content] of entries) assertFileInside(relPath, content);
            // Get the list of files in the extract directory using glob
            const extractDirRelFiles = glob.sync('**/*', { cwd: extractDir, nodir: true }).sort();
            // Get the list of files in the pack directory using glob
            const expectedRelFiles = Array.from(entries.keys()).sort();
            // Assert that the list of files in the extract directory matches the list of files in the pack directory
            expect(extractDirRelFiles).toEqual(expectedRelFiles);
        };

        describe('success cases', () => {
            const genericTest = async (
                name: string,
                deps: Set<string>,
                agdaFiles: Map<string, string>,
                mdFiles: Map<string, string>,
            ) => {
                // Get the debugger
                const dbg = debug('apm:common:tests:models:Package:create');

                // Write the files to the temporary directory
                writeFilesInside(agdaFiles);
                writeFilesInside(mdFiles);

                // Get the filenames
                const agdaFilenames = Array.from(agdaFiles.keys());
                const mdFilenames = Array.from(mdFiles.keys());

                // Create an archive
                const includedFiles = [...agdaFilenames, ...mdFilenames];
                const archive = await tarFs.pack(packDir, { entries: includedFiles });

                // Construct the package from the arguments
                const pkg: Package = await Package.create(packageFilePath, name, deps, archive);

                // Indicate the deps that came back
                dbg(`Deps: ${JSON.stringify(Array.from(pkg.directDeps))}`);

                // Check fields of pkg
                expect(pkg).toBeInstanceOf(Package);
                expect(pkg.filePath).toBe(packageFilePath);
                expect(pkg.name).toBe(name);
                expect(pkg.directDeps).toEqual(deps);
                expect(pkg.id).toBeDefined();
                expect(pkg.archiveOffset).toBeDefined();

                // Extract the archive
                await pipeline(pkg.getArchive(), tarFs.extract(extractDir));

                // Get all files using glob
                const dbgAllFiles = glob.sync('**/*', { cwd: extractDir, nodir: true }).sort();
                dbg(`All files after extractTar: ${JSON.stringify(dbgAllFiles)}`);

                // Concatenate the agda and md files (don't read from fs)
                const concatenatedFiles = new Map<string, string>();
                for (const [filename, content] of agdaFiles) concatenatedFiles.set(filename, content);
                for (const [filename, content] of mdFiles) concatenatedFiles.set(filename, content);

                // Assert the files are present
                assertFilesMatchExactly(concatenatedFiles);
            };

            it('small name, no dependencies, no files', async () => {
                const name = 'Calculus';
                const deps = new Set<string>();
                const agdaFiles = new Map();
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 1 dependency, no files', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0']);
                const agdaFiles = new Map();
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, no files', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map();
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 0 dependencies, 1 agda file', async () => {
                const name = 'Calculus';
                const deps = new Set<string>();
                const agdaFiles = new Map([['file.agda', 'myNat : ℕ\nmyNat = 0']]);
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 0 dependencies, 1 md file', async () => {
                const name = 'Calculus';
                const deps = new Set<string>();
                const agdaFiles = new Map();
                const mdFiles = new Map([['file.md', '# MyNat']]);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 1 dependency, 1 agda file', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0']);
                const agdaFiles = new Map([['file.agda', 'myNat : ℕ\nmyNat = 0']]);
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 1 dependency, 1 md file', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0']);
                const agdaFiles = new Map();
                const mdFiles = new Map([['file.md', '# MyNat']]);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 1 agda file, 1 md file', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map([['file.agda', 'myNat : ℕ\nmyNat = 0']]);
                const mdFiles = new Map([['file.md', '# MyNat']]);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 1 agda file in subdir', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map([['subdir/file.agda', 'myNat : ℕ\nmyNat = 0']]);
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 1 md file in subdir', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map();
                const mdFiles = new Map([['subdir/file.md', '# MyNat']]);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 1 agda file in subdir, 1 md file in subdir', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map([['subdir/file.agda', 'myNat : ℕ\nmyNat = 0']]);
                const mdFiles = new Map([['subdir/file.md', '# MyNat']]);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 10 agda files each in their own subdir', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map();
                for (let i = 0; i < 10; i++) agdaFiles.set(`subdir${i}/file${i}.agda`, `myNat${i} : ℕ\nmyNat${i} = 0`);

                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 10 md files each in their own subdir', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map();
                const mdFiles = new Map();
                for (let i = 0; i < 10; i++) mdFiles.set(`subdir${i}/file${i}.md`, `# MyNat${i}`);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 10 agda files each in their own subdir, 10 md files each in their own subdir', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                const agdaFiles = new Map();
                for (let i = 0; i < 10; i++) agdaFiles.set(`subdir${i}/file${i}.agda`, `myNat${i} : ℕ\nmyNat${i} = 0`);
                const mdFiles = new Map();
                for (let i = 0; i < 10; i++) mdFiles.set(`subdir${i}/file${i}.md`, `# MyNat${i}`);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 2 dependencies, 10 md files each in their own subdir, 10 agda files in root', async () => {
                const name = 'Calculus';
                const deps = new Set<string>(['1.0.0', '1.0.1']);
                // root agda files
                const agdaFiles = new Map();
                for (let i = 0; i < 10; i++) agdaFiles.set(`file${i}.agda`, `myNat${i} : ℕ\nmyNat${i} = 0`);
                // subdir md files
                const mdFiles = new Map();
                for (let i = 0; i < 10; i++) mdFiles.set(`subdir${i}/file${i}.md`, `# MyNat${i}`);

                await genericTest(name, deps, agdaFiles, mdFiles);
            });

            it('small name, 10 dependencies, 50 agda files in doubly nested subdirs', async () => {
                const name = 'Calculus';
                const deps = new Set<string>([
                    '1.0.0',
                    '1.0.1',
                    '1.0.2',
                    '1.0.3',
                    '1.0.4',
                    '1.0.5',
                    '1.0.6',
                    '1.0.7',
                    '1.0.8',
                    '1.0.9',
                ]);
                const agdaFiles = new Map();
                for (let i = 0; i < 50; i++) {
                    const subdir = Math.floor(i / 10);
                    const filename = `file${i % 10}.agda`;
                    agdaFiles.set(`subdir${subdir}/${filename}`, `myNat${i} : ℕ\nmyNat${i} = 0`);
                }
                const mdFiles = new Map();

                await genericTest(name, deps, agdaFiles, mdFiles);
            });
        });

        describe('failure cases', () => {
            it('should throw a PackageCreateError if the file already exists', async () => {
                // Create the file
                fs.writeFileSync(packageFilePath, 'test');

                // Create the files
                const agdaFiles = new Map([['file.agda', 'myNat : ℕ\nmyNat = 0']]);
                const mdFiles = new Map([['file.md', '# MyNat']]);

                // Write the files to the temporary directory
                writeFilesInside(agdaFiles);
                writeFilesInside(mdFiles);

                // Get the filenames
                const agdaFilenames = Array.from(agdaFiles.keys());
                const mdFilenames = Array.from(mdFiles.keys());

                // Create an archive
                const includedFiles = [...agdaFilenames, ...mdFilenames];
                const archive = await tarFs.pack(packDir, { entries: includedFiles });

                // Expect a rejection
                await expect(Package.create(packageFilePath, 'name', new Set<string>(), archive)).rejects.toThrow(
                    PackageCreateError,
                );
            });
        });
    });

    // describe('Package.fromDraft()', () => {
    //     const genericTest = (name: string, deps: Map<string, string>, payload: Buffer) => {
    //         const draft = new Draft(name, deps, payload);
    //         const pkg = Package.fromDraft(draft);
    //         expect(pkg).toBeInstanceOf(Package);
    //     };

    //     it('empty name, no dependencies, no payload', () => {
    //         const draft = new Draft('name', new Map(), Buffer.from([0xff]));
    //         const pkg = Package.fromDraft(draft);
    //         expect(pkg).toBeInstanceOf(Package);
    //     });
    // });

    // it('Package.save() should break if the package was invalid to begin with', () => {
    //     // Get the debugger
    //     const dbg = debug('apm:common:tests:models:package:save');

    //     // Indicate that we are testing the package from file
    //     dbg('Testing Package.save()');

    //     const pkgName = 'name';

    //     // Construct the package path
    //     const pkgPath = path.join(tmpRegistryPath, `${pkgName}.tar`);

    //     // Construct the dependencies
    //     const deps = new Map([
    //         ['dep0', '1.0.0'],
    //         ['dep1', '1.0.1'],
    //         ['dep2', '1.0.2'],
    //     ]);

    //     // Construct the payload (just a uint8)
    //     const payload = Buffer.from([0xff]);

    //     // Create the binary
    //     const binary = getExampleBinary(pkgName, deps, payload);

    //     const binaryInvalid = Buffer.from(binary);

    //     // Print the binary
    //     dbg(`Binary: ${binary.toString('hex')}`);

    //     // Get the id of the package
    //     const id = Package.computeId(binary);

    //     // Print the id
    //     dbg(`Id: ${id}`);

    //     // Create the package file
    //     fs.writeFileSync(pkgPath, binary);

    //     // Find the package
    //     const pkg = Package.load(pkgPath);

    //     expect(pkg).toBeInstanceOf(Package);

    //     expect(pkg.getName()).toBe(pkgName);
    //     expect(pkg.getDeps()).toEqual(deps);
    //     expect(pkg.getId()).toBe(id);
    //     expect(pkg.getPayload()).toEqual(payload);
    // });
});
