import path from 'path';
import fs from 'fs';
import os from 'os';
import { expect, describe, it, beforeEach, beforeAll } from '@jest/globals';
import { __test__ as ProjectTest, Project } from '../../src/models/project';
import { glob } from 'glob';
import FailedToParseDepsError from '../../src/errors/failed-to-parse-deps';
import ReadDepsFileError from '../../src/errors/read-deps-file';
import WriteDepsFileError from '../../src/errors/write-deps-file';
import ProjectLoadError from '../../src/errors/project-load';
import SourceLoadError from '../../src/errors/source-load';
import ProjectInitError from '../../src/errors/project-init';
import { Package } from '../../src/models/package';
import { Source } from '../../src/models/source';
import { Registry } from '../../src/models/registry';
import { Readable } from 'stream';
import CheckProjectError from '../../src/errors/check-project';
import PackageLoadError from '../../src/errors/package-load';
import { ProjectAddError } from '../../src/errors/project-add';
import { ProjectRemoveError } from '../../src/errors/project-remove';

describe('models/Project', () => {
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

    const testCaseDir = path.join(os.tmpdir(), 'project-test-case-tmpdir');

    const depend = (deps: Package[]) => {
        const result = new Set<string>();
        for (const dep of deps) result.add(dep.id);
        return result;
    };

    describe('parseDirectDeps()', () => {
        describe('success cases', () => {
            it('should parse as an empty set if the string is empty', () => {
                const raw = '';
                const deps = ProjectTest.parseDirectDeps(raw);
                expect(deps).toEqual(new Set<string>());
            });

            it('should parse correctly with one dependency', () => {
                const raw = 'ver0';
                const deps = ProjectTest.parseDirectDeps(raw);
                expect(deps).toEqual(new Set<string>(['ver0']));
            });

            it('should parse correctly with two dependencies', () => {
                const raw = 'ver0\nver1';
                const deps = ProjectTest.parseDirectDeps(raw);
                expect(deps).toEqual(new Set<string>(['ver0', 'ver1']));
            });

            it('should parse correctly with many dependencies', () => {
                const raw = 'ver0\nver1\nver2\nver3\nver4\nver5';
                const deps = ProjectTest.parseDirectDeps(raw);
                expect(deps).toEqual(new Set<string>(['ver0', 'ver1', 'ver2', 'ver3', 'ver4', 'ver5']));
            });

            it('should successfully parse if the string contains any redundant newlines', () => {
                const raw = 'ver0\n\nver1';
                const deps = ProjectTest.parseDirectDeps(raw);
                expect(deps).toEqual(new Set<string>(['ver0', 'ver1']));
            });

            it('should successfully parse if the string contains any redundant newlines', () => {
                const raw = 'ver0\n\n\nver1\n\n\n\nver2\n\n\n';
                const deps = ProjectTest.parseDirectDeps(raw);
                expect(deps).toEqual(new Set<string>(['ver0', 'ver1', 'ver2']));
            });
        });

        describe('failure cases', () => {
            it('should throw a FailedToParseDepsError if the string contains any invalid dependencies', () => {
                const raw = 'ver0 EXTRA';
                expect(() => ProjectTest.parseDirectDeps(raw)).toThrow(FailedToParseDepsError);
            });

            it('should throw a FailedToParseDepsError if the only line starts with a space', () => {
                const raw = ' ver0';
                expect(() => ProjectTest.parseDirectDeps(raw)).toThrow(FailedToParseDepsError);
            });

            it('should throw a FailedToParseDepsError if any lines start with a space', () => {
                const raw = 'ver0\n ver1\nver2';
                expect(() => ProjectTest.parseDirectDeps(raw)).toThrow(FailedToParseDepsError);
            });
        });
    });

    describe('readDirectDepsFile()', () => {
        const tmpDir = path.join(os.tmpdir(), 'apm-test-read-deps-file');
        const depsPath = path.join(tmpDir, 'deps.txt');

        beforeEach(() => {
            // Remove the directory if it exists
            if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir, { recursive: true });
            // Create a directory
            fs.mkdirSync(tmpDir);
        });

        describe('success cases', () => {
            it('empty dependencies file', () => {
                // Write the empty dependencies file
                fs.writeFileSync(depsPath, '');

                // Read the dependencies file
                const deps = ProjectTest.readDirectDepsFile(tmpDir);
                expect(deps).toEqual(new Set<string>());
            });

            it('one dependency', () => {
                // Write the dependencies file
                fs.writeFileSync(depsPath, 'ver0');

                // Read the dependencies file
                const deps = ProjectTest.readDirectDepsFile(tmpDir);
                expect(deps).toEqual(new Set<string>(['ver0']));
            });

            it('many dependencies', () => {
                // Write the dependencies file
                fs.writeFileSync(depsPath, 'ver0\nver1\nver2');

                // Read the dependencies file
                const deps = ProjectTest.readDirectDepsFile(tmpDir);
                expect(deps).toEqual(new Set<string>(['ver0', 'ver1', 'ver2']));
            });
        });

        describe('failure cases', () => {
            it('should throw a ReadDepsFileError if the file does not exist', () => {
                expect(() => ProjectTest.readDirectDepsFile(tmpDir)).toThrow(ReadDepsFileError);
            });

            it('should throw a ReadDepsFileError if the file is not a file', () => {
                // Create deps.txt folder
                fs.mkdirSync(depsPath);
                expect(() => ProjectTest.readDirectDepsFile(tmpDir)).toThrow(ReadDepsFileError);
            });

            it('should throw a FailedToParseDepsError if the file is not valid', () => {
                // Write the dependencies file
                fs.writeFileSync(depsPath, ' ver0');

                // Read the dependencies file
                expect(() => ProjectTest.readDirectDepsFile(tmpDir)).toThrow(FailedToParseDepsError);
            });
        });
    });

    describe('writeDirectDepsFile()', () => {
        const tmpDir = path.join(os.tmpdir(), 'apm-test-write-deps-file');
        const depsPath = path.join(tmpDir, 'deps.txt');

        describe('success cases', () => {
            beforeEach(async () => {
                // Remove the directory if it exists
                if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir, { recursive: true });
                // Create a directory
                fs.mkdirSync(tmpDir);
                // sleep for 15 seconds
                // await new Promise((resolve) => setTimeout(resolve, 15000));
            });

            it('empty dependencies file', async () => {
                // Construct the dependencies
                const deps = new Set<string>();

                // Write the empty dependencies file
                await ProjectTest.writeDirectDepsFile(tmpDir, deps);

                // Read the dependencies file
                const depsRaw = fs.readFileSync(depsPath, 'utf8');

                // Check the result
                expect(depsRaw).toBe('');
            });

            it('one dependency', async () => {
                // Construct the dependencies
                const deps = new Set<string>(['ver0']);

                // Write the dependencies file
                await ProjectTest.writeDirectDepsFile(tmpDir, deps);

                // Read the dependencies file
                const depsRaw = fs.readFileSync(depsPath, 'utf8');

                // Check the result
                expect(depsRaw).toBe('ver0\n');
            });

            it('many dependencies', async () => {
                // Construct the dependencies
                const deps = new Set<string>(['ver0', 'ver1', 'ver2']);

                // Write the dependencies file
                await ProjectTest.writeDirectDepsFile(tmpDir, deps);

                // Read the dependencies file
                const depsRaw = fs.readFileSync(depsPath, 'utf8');

                // Check the result
                expect(depsRaw).toBe('ver0\nver1\nver2\n');
            });
        });

        describe('failure cases', () => {
            it('should throw a WriteDepsFileError if the directory does not exist', () => {
                // Remove the directory if it exists
                if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir, { recursive: true });

                // Expect rejection
                expect(async () => await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>())).rejects.toThrow(
                    WriteDepsFileError,
                );
            });

            // it('should throw a WriteDepsFileError if the file already exists', () => {
            //     // Create the directory
            //     fs.mkdirSync(tmpDir);

            //     // Create the file
            //     fs.writeFileSync(depsPath, 'ver0');

            //     // Expect rejection
            //     expect(async () => await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>())).rejects.toThrow(
            //         WriteDepsFileError,
            //     );
            // });
        });

        // it('should read the direct dependencies file correctly', () => {
        //     const deps = (Package as any).readDirectDepsFile(
        //         path.join(__dirname, '..', '..', '..', '..', 'test-data', 'deps.txt'),
        //     );
        //     expect(deps).toEqual(
        //         new Map([
        //             ['dep0', 'ver0'],
        //             ['dep1', 'ver1'],
        //         ]),
        //     );
        // });
    });

    describe('createAgdaLibFile()', () => {
        const tmpDir = path.join(os.tmpdir(), 'apm-test-create-agda-lib-file');

        beforeEach(() => {
            // Remove the temporary directory if it exists
            if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

            // Create the temporary directory
            fs.mkdirSync(tmpDir, { recursive: true });
        });

        describe('success cases', () => {
            it('should create the .agda-lib file', () => {
                ProjectTest.createAgdaLibFile(tmpDir, 'APMTmpProject');
                const agdaLibPath = path.join(tmpDir, '.agda-lib');
                const agdaLibContent = fs.readFileSync(agdaLibPath, 'utf8');
                expect(fs.existsSync(agdaLibPath)).toBe(true);
                expect(agdaLibContent).toBe('name: APMTmpProject\ninclude: . deps');
            });
        });

        describe('failure cases', () => {
            it('should throw a ProjectInitError if the path does not exist', () => {
                const invalidPath = path.join(tmpDir, 'does-not-exist');
                expect(() => ProjectTest.createAgdaLibFile(invalidPath, 'APMTmpProject')).toThrow(ProjectInitError);
            });

            it('should throw a ProjectInitError if the path is not a directory', () => {
                const invalidPath = path.join(tmpDir, 'not-a-directory');
                fs.writeFileSync(invalidPath, 'not-a-directory');
                expect(() => ProjectTest.createAgdaLibFile(invalidPath, 'APMTmpProject')).toThrow(ProjectInitError);
            });
        });
    });

    describe('readProjectName()', () => {
        const tmpDir = path.join(os.tmpdir(), 'apm-test-read-project-name');

        beforeEach(() => {
            // Remove the temporary directory if it exists
            if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

            // Create the temporary directory
            fs.mkdirSync(tmpDir, { recursive: true });
        });

        describe('success cases', () => {
            it('should read the project name from the .agda-lib file', () => {
                const projectName = 'APMTmpProject';
                const agdaLibPath = path.join(tmpDir, '.agda-lib');
                fs.writeFileSync(agdaLibPath, `name: ${projectName}\ninclude: . deps`);
                const recoveredProjectName = ProjectTest.readProjectName(tmpDir);
                expect(recoveredProjectName).toBe(projectName);
            });
        });

        describe('failure cases', () => {
            it('should throw a ProjectLoadError if the .agda-lib file does not exist', () => {
                const agdaLibPath = path.join(tmpDir, '.agda-lib');
                expect(() => ProjectTest.readProjectName(tmpDir)).toThrow(ProjectLoadError);
            });

            it('should throw a ProjectLoadError if the .agda-lib file is not a file', () => {
                const agdaLibPath = path.join(tmpDir, '.agda-lib');
                fs.mkdirSync(agdaLibPath);
                expect(() => ProjectTest.readProjectName(tmpDir)).toThrow(ProjectLoadError);
            });

            it('should throw a ProjectLoadError if the .agda-lib file is missing a name line', () => {
                const agdaLibPath = path.join(tmpDir, '.agda-lib');
                fs.writeFileSync(agdaLibPath, 'include: . deps');
                expect(() => ProjectTest.readProjectName(tmpDir)).toThrow(ProjectLoadError);
            });

            it('should throw a ProjectLoadError if the .agda-lib file is missing the actual project name', () => {
                const agdaLibPath = path.join(tmpDir, '.agda-lib');
                fs.writeFileSync(agdaLibPath, 'name:\ninclude: . deps');
                expect(() => ProjectTest.readProjectName(tmpDir)).toThrow(ProjectLoadError);
            });
        });
    });

    // PUBLIC INTERFACE TESTS
    describe('Project.load()', () => {
        describe('success cases', () => {
            const projectName = 'APMTmpProject';
            const tmpDir = path.join(os.tmpdir(), projectName);

            const writeFileInside = (relPath: string, content: string) => {
                const filePath = path.join(tmpDir, relPath);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, content);
            };

            const createRootSource = (files: Map<string, string>) => {
                const rootSourceDir = path.join(tmpDir, projectName);
                // Create the dir if it doesnt exist
                if (!fs.existsSync(rootSourceDir)) fs.mkdirSync(rootSourceDir, { recursive: true });
                // Create the files
                for (const [relPath, content] of files.entries()) {
                    writeFileInside(path.join(projectName, relPath), content);
                }
            };

            beforeEach(() => {
                // Remove the temporary directory if it exists
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

                // Create the temporary directory
                fs.mkdirSync(tmpDir, { recursive: true });
            });

            it('empty deps.txt file and no source files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map());

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('empty deps.txt file and one dirt file (.txt)', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['file.txt', 'Hello, world!']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('empty deps.txt file and one agda file', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['file.agda', 'myNat : ℕ\nmyNat = 0']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['file.agda']);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('empty deps.txt file and one md file', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['file.md', '# My Document']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual(['file.md']);
            });

            it('empty deps.txt file and one agda file and one md file', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['file.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file.md', '# My Document'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['file.agda']);
                expect(project.rootSource.mdFiles).toEqual(['file.md']);
            });

            it('empty deps.txt file and one agda file in nested directory', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['subdir/file.agda', 'myNat : ℕ\nmyNat = 0']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['subdir/file.agda']);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('empty deps.txt file and one md file in nested directory', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['subdir/file.md', '# My Document']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual(['subdir/file.md']);
            });

            it('empty deps.txt file and one agda file and one md file in nested directory', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['subdir/file1.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir/file2.md', '# My Document'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['subdir/file1.agda']);
                expect(project.rootSource.mdFiles).toEqual(['subdir/file2.md']);
            });

            it('empty deps.txt file and one agda file in doubly-nested directory', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['subdir/subdir2/file.agda', 'myNat : ℕ\nmyNat = 0']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['subdir/subdir2/file.agda']);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('empty deps.txt file and multiple agda files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['file1.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file2.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file3.agda', 'myNat : ℕ\nmyNat = 0'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles.sort()).toEqual(['file1.agda', 'file2.agda', 'file3.agda'].sort());
                expect(project.rootSource.mdFiles.sort()).toEqual([]);
            });

            it('empty deps.txt file and multiple md files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['file1.md', '# My Document'],
                        ['file2.md', '# My Document'],
                        ['file3.md', '# My Document'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles.sort()).toEqual([]);
                expect(project.rootSource.mdFiles.sort()).toEqual(['file1.md', 'file2.md', 'file3.md'].sort());
            });

            it('empty deps.txt file and multiple agda files and multiple md files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['file1.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file2.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file3.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file1.md', '# My Document'],
                        ['file2.md', '# My Document'],
                        ['file3.md', '# My Document'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles.sort()).toEqual(['file1.agda', 'file2.agda', 'file3.agda'].sort());
                expect(project.rootSource.mdFiles.sort()).toEqual(['file1.md', 'file2.md', 'file3.md'].sort());
            });

            it('empty deps.txt file and multiple agda files and multiple md files in nested directories', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>());

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['subdir1/file1.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir1/README.md', '# My Document'],
                        ['subdir2/file2.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir2/README.md', '# My Document'],
                        ['subdir2/subdir3/file3.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir2/subdir3/README.md', '# My Document'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>());
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles.sort()).toEqual(
                    ['subdir1/file1.agda', 'subdir2/file2.agda', 'subdir2/subdir3/file3.agda'].sort(),
                );
                expect(project.rootSource.mdFiles.sort()).toEqual(
                    ['subdir1/README.md', 'subdir2/README.md', 'subdir2/subdir3/README.md'].sort(),
                );
            });

            it('single package deps.txt file and no source files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>(['1.0.0']));

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map());

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('two package deps.txt file and no source files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>(['1.0.0', '1.0.1']));

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map());

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '1.0.1']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('two package deps.txt file and one agda file', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>(['1.0.0', '1.0.1']));

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['file.agda', 'myNat : ℕ\nmyNat = 0']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '1.0.1']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['file.agda']);
                expect(project.rootSource.mdFiles).toEqual([]);
            });

            it('two package deps.txt file and one md file', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>(['1.0.0', '1.0.1']));

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(new Map([['file.md', '# My Document']]));

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '1.0.1']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual([]);
                expect(project.rootSource.mdFiles).toEqual(['file.md']);
            });

            it('two package deps.txt file and one agda file and one md file', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(tmpDir, new Set<string>(['1.0.0', '1.0.1']));

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['file.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file.md', '# My Document'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '1.0.1']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles).toEqual(['file.agda']);
                expect(project.rootSource.mdFiles).toEqual(['file.md']);
            });

            it('many package deps.txt file and multiple agda files', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(
                    tmpDir,
                    new Set<string>(['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4']),
                );

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['file1.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file2.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file3.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file4.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['file5.agda', 'myNat : ℕ\nmyNat = 0'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles.sort()).toEqual(
                    ['file1.agda', 'file2.agda', 'file3.agda', 'file4.agda', 'file5.agda'].sort(),
                );
                expect(project.rootSource.mdFiles.sort()).toEqual([]);
            });

            it('many package deps.txt file and multiple agda files in random nested directories', async () => {
                // Create the deps file
                await ProjectTest.writeDirectDepsFile(
                    tmpDir,
                    new Set<string>(['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4']),
                );

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(tmpDir, projectName);

                // Create the root source
                createRootSource(
                    new Map([
                        ['subdir1/file1.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir1/subdir2/subdir3/subdir4/file2.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir2/file3.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir4/file4.agda', 'myNat : ℕ\nmyNat = 0'],
                        ['subdir3/file5.agda', 'myNat : ℕ\nmyNat = 0'],
                    ]),
                );

                // Load the project
                const project = await Project.load(tmpDir);

                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                expect(project.name).toBe('APMTmpProject');
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4']));
                expect(project.cwd).toBe(tmpDir);
                expect(project.rootSource.agdaFiles.sort()).toEqual(
                    [
                        'subdir1/file1.agda',
                        'subdir1/subdir2/subdir3/subdir4/file2.agda',
                        'subdir2/file3.agda',
                        'subdir4/file4.agda',
                        'subdir3/file5.agda',
                    ].sort(),
                );
                expect(project.rootSource.mdFiles.sort()).toEqual([]);
            });
        });

        describe('failure cases', () => {
            const tmpDir = path.join(os.tmpdir(), 'failure-cases');

            beforeEach(() => {
                // Remove the temporary directory if it exists
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

                // Create the temporary directory
                fs.mkdirSync(tmpDir, { recursive: true });
            });

            it('should throw a ProjectLoadError if the path does not exist', async () => {
                const srcPath = path.join(tmpDir, 'does-not-exist');
                // Ensure the path does not exist
                if (fs.existsSync(srcPath)) fs.rmSync(srcPath, { recursive: true, force: true });

                // Expect a rejection
                await expect(Project.load(srcPath)).rejects.toThrow(ProjectLoadError);
            });

            it('should throw a ProjectLoadError if the path is not a directory', async () => {
                const srcPath = path.join(tmpDir, 'not-a-directory');

                // Ensure the path does not exist
                if (fs.existsSync(srcPath)) fs.rmSync(srcPath, { recursive: true, force: true });

                // Create the file
                fs.writeFileSync(srcPath, 'not-a-directory');

                // Expect the file to exist
                expect(fs.existsSync(srcPath)).toBe(true);

                // Expect a rejection
                await expect(Project.load(srcPath)).rejects.toThrow(ProjectLoadError);
            });

            it('should throw a ReadDepsFileError if the path does not contain a deps.txt file', async () => {
                const srcPath = path.join(tmpDir, 'no-deps-txt');

                // Create the file
                fs.mkdirSync(srcPath, { recursive: true });

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(srcPath, 'FailProject');

                // Expect the file to exist
                expect(fs.existsSync(srcPath)).toBe(true);

                // Expect a rejection
                await expect(Project.load(srcPath)).rejects.toThrow(ReadDepsFileError);
            });

            it('should throw a ReadDepsFileError if the deps.txt is not a file', async () => {
                const srcPath = path.join(tmpDir, 'no-deps-txt');
                const depsTxtPath = path.join(srcPath, 'deps.txt');

                // Create the file
                fs.mkdirSync(srcPath, { recursive: true });

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(srcPath, 'FailProject');

                // Create the deps.txt folder (yes, this is strange, but it's just for testing)
                fs.mkdirSync(depsTxtPath, { recursive: true });

                // Expect the folder to exist
                expect(fs.existsSync(depsTxtPath)).toBe(true);

                // Expect a rejection
                await expect(Project.load(srcPath)).rejects.toThrow(ReadDepsFileError);
            });

            it('should throw a FailedToParseDepsError if the deps.txt file is invalid', async () => {
                const srcPath = path.join(tmpDir, 'invalid-deps-txt');
                const depsTxtPath = path.join(srcPath, 'deps.txt');

                // Create the file
                fs.mkdirSync(srcPath, { recursive: true });

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(srcPath, 'FailProject');

                // Create the deps.txt file
                fs.writeFileSync(depsTxtPath, ' ver0');

                // Expect the file to exist
                expect(fs.existsSync(depsTxtPath)).toBe(true);

                // Expect a rejection
                await expect(Project.load(srcPath)).rejects.toThrow(FailedToParseDepsError);
            });

            it('should throw a SourceLoadError if the path does not contain a root source directory', async () => {
                const srcPath = path.join(tmpDir, 'no-root-source');

                // Create the folder
                fs.mkdirSync(srcPath, { recursive: true });

                // Create the .agda-lib file
                ProjectTest.createAgdaLibFile(srcPath, 'FailProject');

                // Create the deps.txt file
                fs.writeFileSync(path.join(srcPath, 'deps.txt'), 'ver0');

                // Expect a rejection
                await expect(Project.load(srcPath)).rejects.toThrow(SourceLoadError);
            });

            // it('should throw a ProjectLoadError if the project does not contain an agda lib file', async () => {
            //     const srcPath = path.join(tmpDir, 'no-root-source');

            //     // Create the folder
            //     fs.mkdirSync(srcPath, { recursive: true });

            //     // Create the deps.txt file
            //     fs.writeFileSync(path.join(srcPath, 'deps.txt'), 'ver0');

            //     // Expect a rejection
            //     await expect(Project.load(srcPath)).rejects.toThrow(SourceLoadError);
            // });
        });
    });

    describe('Project.init()', () => {
        const packDir = path.join(os.tmpdir(), 'apm-project-init-pack-dir');
        const extractDir = path.join(os.tmpdir(), 'apm-project-init-extract-dir');
        let pkg: Package; // a helper package that can be used for all tests
        let pkgFiles: Map<string, string>; // the files in the helper package
        const projectName = 'APMTmpProject';

        beforeEach(() => {
            // Remove the temporary directory if it exists
            if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true, force: true });
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            // Create the temporary directory
            fs.mkdirSync(packDir, { recursive: true });
            fs.mkdirSync(extractDir, { recursive: true });
        });

        beforeAll(async () => {
            // Construct the helper package that will be used for all tests
            const directDeps = new Set<string>(['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4']);

            // Make the helper package dir path
            const helperDir = path.join(os.tmpdir(), 'project-init-helper');

            // If the helper dir exists, remove it
            if (fs.existsSync(helperDir)) fs.rmSync(helperDir, { recursive: true, force: true });

            // Create the helper dir
            fs.mkdirSync(helperDir, { recursive: true });

            // Make the source dir path
            const sourceDir = path.join(helperDir, 'source');

            // Make the helper package path
            const helperPackagePath = path.join(helperDir, `temp.apm`);

            // Remove the source dir if it exists
            if (fs.existsSync(sourceDir)) fs.rmSync(sourceDir, { recursive: true, force: true });

            // Create the source dir
            fs.mkdirSync(sourceDir, { recursive: true });

            pkgFiles = new Map([
                ['file1.agda', 'myNat : ℕ\nmyNat = 0'],
                ['file2.agda', 'myNat : ℕ\nmyNat = 0'],
                ['file3.md', '# My Document'],
                ['subdir/file4.agda', 'myNat : ℕ\nmyNat = 0'],
                ['subdir/file5.md', '# My Document'],
            ]);

            // Add files to source dir
            writeFilesInside(sourceDir, pkgFiles);

            // Construct source object
            const source: Source = await Source.load(sourceDir);

            // Create the archive
            const archive: Readable = source.getArchive();

            // Create the helper package
            pkg = await Package.create(helperPackagePath, projectName, directDeps, archive);
        });

        const writeFileInside = (baseDir: string, relPath: string, content: string) => {
            // Write the file inside the temporary directory
            const filePath = path.join(baseDir, relPath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        };

        const writeFilesInside = (baseDir: string, entries: Map<string, string>) => {
            for (const [relPath, content] of entries) writeFileInside(baseDir, relPath, content);
        };

        describe('success cases', () => {
            const assertFileInside = (baseDir: string, relPath: string, content: string) => {
                const filePath = path.join(baseDir, relPath);
                expect(fs.existsSync(filePath)).toBe(true);
                expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
            };

            const assertFilesMatchExactly = (baseDir: string, entries: Map<string, string>) => {
                for (const [relPath, content] of entries) assertFileInside(baseDir, relPath, content);
                // Get the list of files in the extract directory using glob
                const extractDirRelFiles = glob.sync('**/*', { cwd: baseDir, nodir: true }).sort();
                // Get the list of files in the pack directory using glob
                const expectedRelFiles = Array.from(entries.keys()).sort();
                // Assert that the list of files in the extract directory matches the list of files in the pack directory
                expect(extractDirRelFiles).toEqual(expectedRelFiles);
            };

            it('no archive supplied', async () => {
                // Make the project path
                const projectPath = path.join(extractDir, projectName);
                // Create the project folder
                fs.mkdirSync(projectPath, { recursive: true });
                // Create the project
                const project = await Project.init(projectPath, { projectName });
                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                // Expect the project name to be APMTmpProject
                expect(project.name).toBe(projectName);
                // Expect the project path to be the temporary directory
                expect(project.cwd).toBe(projectPath);
                // Expect the project to have a root source
                const rootSourcePath = path.join(projectPath, projectName);
                expect(fs.existsSync(rootSourcePath)).toBe(true);
                // Expect the project to have a deps.txt file
                const depsTxtPath = path.join(projectPath, 'deps.txt');
                expect(fs.existsSync(depsTxtPath)).toBe(true);
                // Expect the project to have a .agda-lib file
                const agdaLibPath = path.join(projectPath, '.agda-lib');
                expect(fs.existsSync(agdaLibPath)).toBe(true);
            });

            it('archive supplied', async () => {
                // Make the project path
                const projectPath = path.join(extractDir, projectName);
                // Create the project folder
                fs.mkdirSync(projectPath, { recursive: true });
                // Create the project
                const project = await Project.init(projectPath, { pkg });
                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                // Expect the project name to be APMTmpProject
                expect(project.name).toBe(projectName);
                // Expect the project path to be the temporary directory
                expect(project.cwd).toBe(projectPath);
                // Expect the project to have a root source
                const rootSourcePath = path.join(projectPath, projectName);
                expect(fs.existsSync(rootSourcePath)).toBe(true);
                // Expect the project to have a deps.txt file
                const depsTxtPath = path.join(projectPath, 'deps.txt');
                expect(fs.existsSync(depsTxtPath)).toBe(true);
                // Expect the project to have a .agda-lib file
                const agdaLibPath = path.join(projectPath, '.agda-lib');
                expect(fs.existsSync(agdaLibPath)).toBe(true);

                // Assert that the files in the project match the files in the package
                assertFilesMatchExactly(rootSourcePath, pkgFiles);
            });

            it('no archive supplied, deps supplied', async () => {
                // Make the project path
                const projectPath = path.join(extractDir, projectName);
                // Create the project folder
                fs.mkdirSync(projectPath, { recursive: true });
                // Create the project
                const project = await Project.init(projectPath, {
                    projectName,
                    deps: new Set<string>(['1.0.0', '2.0.0']),
                });
                // Expect the project to be an instance of Project
                expect(project).toBeInstanceOf(Project);
                // Expect the project name to be APMTmpProject
                expect(project.name).toBe(projectName);
                // Expect the project path to be the temporary directory
                expect(project.cwd).toBe(projectPath);
                // Expect the project to have a root source
                const rootSourcePath = path.join(projectPath, projectName);
                expect(fs.existsSync(rootSourcePath)).toBe(true);
                // Expect the project to have a deps.txt file
                const depsTxtPath = path.join(projectPath, 'deps.txt');
                expect(fs.existsSync(depsTxtPath)).toBe(true);
                // Expect the project to have a .agda-lib file
                const agdaLibPath = path.join(projectPath, '.agda-lib');
                expect(fs.existsSync(agdaLibPath)).toBe(true);
                // Expect the project to have the correct deps
                expect(project.directDeps).toEqual(new Set<string>(['1.0.0', '2.0.0']));
            });
        });

        describe('failure cases', () => {
            it('should throw a ProjectInitError if the path does not exist', async () => {
                // Make the path
                const srcPath = path.join(extractDir, 'does-not-exist');
                // Expect a rejection
                await expect(Project.init(srcPath, { projectName })).rejects.toThrow(ProjectInitError);
            });

            it('should throw a ProjectInitError if the path is not a directory', async () => {
                // Make the path
                const srcPath = path.join(extractDir, 'not-a-directory');
                // Create the file
                fs.writeFileSync(srcPath, 'not-a-directory');
                // Expect a rejection
                await expect(Project.init(srcPath, { projectName })).rejects.toThrow(ProjectInitError);
            });

            it('should throw a ProjectInitError if the directory already contains a dependencies file', async () => {
                // Make the project path
                const projectPath = path.join(extractDir, projectName);
                // Create the project folder
                fs.mkdirSync(projectPath, { recursive: true });
                // Get path to the dependencies file
                const depsTxtPath = path.join(projectPath, 'deps.txt');
                // Create the dependencies file
                fs.writeFileSync(depsTxtPath, '');
                // Expect a rejection
                await expect(Project.init(projectPath, { projectName })).rejects.toThrow(ProjectInitError);
            });

            it('should throw a ProjectInitError if the directory already contains a root source directory', async () => {
                // Make the project path
                const projectPath = path.join(extractDir, projectName);
                // Create the project folder
                fs.mkdirSync(projectPath, { recursive: true });
                // Get path to the root source directory
                const rootSourcePath = path.join(projectPath, projectName);
                // Create the root source directory
                fs.mkdirSync(rootSourcePath, { recursive: true });
                // Expect a rejection
                await expect(Project.init(projectPath, { projectName })).rejects.toThrow(ProjectInitError);
            });

            it('should throw a ProjectInitError if the directory already contains a .agda-lib file', async () => {
                // Make the project path
                const projectPath = path.join(extractDir, projectName);
                // Create the project folder
                fs.mkdirSync(projectPath, { recursive: true });
                // Get path to the .agda-lib file
                const agdaLibPath = path.join(projectPath, '.agda-lib');
                // Create the .agda-lib file
                fs.writeFileSync(agdaLibPath, '');
                // Expect a rejection
                await expect(Project.init(projectPath, { projectName })).rejects.toThrow(ProjectInitError);
            });
        });
    });

    describe('Project.install()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');
        const projectPath = path.join(testCaseDir, 'project');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // If the project dir exists, remove it
            if (fs.existsSync(projectPath)) fs.rmSync(projectPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        describe('success cases', () => {
            const genericTest = async (deps: Set<string>, expectedSourceNames: string[]) => {
                // create the project dir
                fs.mkdirSync(projectPath, { recursive: true });
                // create the project
                let project = await Project.init(projectPath, { projectName: 'TestProject', deps });
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const projectTree = await registry.getProjectTree(project.directDeps);
                // get the install dependencies
                const installDeps = projectTree.flatMap((tree) => tree.getTopologicalSort());
                // install the project
                await project.install(installDeps);
                // reload the project
                project = await Project.load(projectPath);
                // expect the project to have sources corresponding to the expected source names
                const actualSourceNames = project.dependencySources.map((source) => path.basename(source.cwd));
                expect(actualSourceNames.sort()).toEqual(expectedSourceNames.sort());
            };

            it('no dependencies', async () => {
                await genericTest(new Set<string>(), []);
            });

            it('one dependency', async () => {
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
                // execute the generic test
                await genericTest(new Set<string>([pkg0.id]), [pkg0.name]);
            });

            it('two dependencies', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                await registry.put(pkg1);
                // execute the generic test
                await genericTest(new Set<string>([pkg0.id, pkg1.id]), [pkg0.name, pkg1.name]);
            });

            it('one direct dependency, one transitive dependency', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                await registry.put(pkg1);
                // execute the generic test
                await genericTest(new Set<string>([pkg1.id]), [pkg0.name, pkg1.name]);
            });

            it('two direct dependencies, one transitive dependency', async () => {
                const pkg0 = await createPackage(
                    path.join(localPackagesPath, 'pkg0.apm'),
                    'pkg0',
                    depend([]),
                    new Map(),
                );
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0]),
                    new Map(),
                );
                const pkg2 = await createPackage(
                    path.join(localPackagesPath, 'pkg2.apm'),
                    'pkg2',
                    depend([]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0);
                await registry.put(pkg1);
                await registry.put(pkg2);
                // execute the generic test
                await genericTest(new Set<string>([pkg1.id, pkg2.id]), [pkg0.name, pkg1.name, pkg2.name]);
            });

            it('two direct dependencies, one transitive dependency that does NOT get overridden', async () => {
                // create a dependency of the original package
                const pkg0OriginalDep = await createPackage(
                    path.join(localPackagesPath, 'pkg0OriginalDep.apm'),
                    'pkg0OriginalDep',
                    depend([]),
                    new Map(),
                );
                // create the original package
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([pkg0OriginalDep]),
                    new Map(),
                );
                // extra package to differentiate between the original and override
                const pkg0OverrideDep = await createPackage(
                    path.join(localPackagesPath, 'pkg0OverrideDep.apm'),
                    'pkg0OverrideDep',
                    depend([]),
                    new Map(),
                );
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0',
                    depend([pkg0OverrideDep]),
                    new Map(),
                );
                // create a dependent of the original package
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0Original]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0OriginalDep);
                await registry.put(pkg0Original);
                await registry.put(pkg0OverrideDep);
                await registry.put(pkg0Override);
                await registry.put(pkg1);
                // execute the generic test
                await genericTest(new Set<string>([pkg1.id]), [pkg0OriginalDep.name, pkg0Original.name, pkg1.name]);
            });

            it('two direct dependencies, one transitive dependency that gets overridden', async () => {
                // create a dependency of the original package
                const pkg0OriginalDep = await createPackage(
                    path.join(localPackagesPath, 'pkg0OriginalDep.apm'),
                    'pkg0OriginalDep',
                    depend([]),
                    new Map(),
                );
                // create the original package
                const pkg0Original = await createPackage(
                    path.join(localPackagesPath, 'pkg0Original.apm'),
                    'pkg0',
                    depend([pkg0OriginalDep]),
                    new Map(),
                );
                // extra package to differentiate between the original and override
                const pkg0OverrideDep = await createPackage(
                    path.join(localPackagesPath, 'pkg0OverrideDep.apm'),
                    'pkg0OverrideDep',
                    depend([]),
                    new Map(),
                );
                const pkg0Override = await createPackage(
                    path.join(localPackagesPath, 'pkg0Override.apm'),
                    'pkg0',
                    depend([pkg0OverrideDep]),
                    new Map(),
                );
                // create a dependent of the original package
                const pkg1 = await createPackage(
                    path.join(localPackagesPath, 'pkg1.apm'),
                    'pkg1',
                    depend([pkg0Original]),
                    new Map(),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkg0OriginalDep);
                await registry.put(pkg0Original);
                await registry.put(pkg0OverrideDep);
                await registry.put(pkg0Override);
                await registry.put(pkg1);
                // execute the generic test
                await genericTest(new Set<string>([pkg1.id, pkg0Override.id]), [
                    pkg0OverrideDep.name,
                    pkg0Override.name,
                    pkg1.name,
                ]);
            });

            it('ten direct dependencies, each depending on the same common dependency', async () => {
                // create the common dependency
                const pkgCommonDep = await createPackage(
                    path.join(localPackagesPath, 'pkgCommonDep.apm'),
                    'pkgCommonDep',
                    depend([]),
                    new Map(),
                );
                // create the remaining packages
                const remainingPkgs = await Promise.all(
                    Array.from({ length: 10 }, (_, i) =>
                        createPackage(
                            path.join(localPackagesPath, `pkg${i}.apm`),
                            `pkg${i}`,
                            depend([pkgCommonDep]),
                            new Map(),
                        ),
                    ),
                );
                // load the registry
                const registry = await Registry.load(registryPath);
                // put the package
                await registry.put(pkgCommonDep);
                await Promise.all(remainingPkgs.map((pkg) => registry.put(pkg)));
                // execute the generic test
                await genericTest(new Set<string>([...remainingPkgs.map((pkg) => pkg.id), pkgCommonDep.id]), [
                    pkgCommonDep.name,
                    ...remainingPkgs.map((pkg) => pkg.name),
                ]);
            });
        });

        describe('failure cases', () => {
            const genericTest = async (deps: Set<string>, expectedSourceNames: string[]) => {
                // create the project dir
                fs.mkdirSync(projectPath, { recursive: true });
                // create the project
                let project = await Project.init(projectPath, { projectName: 'TestProject', deps });
                // load the registry
                const registry = await Registry.load(registryPath);
                // get the project tree
                const projectTree = await registry.getProjectTree(project.directDeps);
                // get the install dependencies
                const installDeps = projectTree.flatMap((tree) => tree.getTopologicalSort());
                // install the project
                await project.install(installDeps);
            };

            it('1 unregistered dependency', async () => {
                // execute the generic test
                await expect(genericTest(new Set<string>(['DNE-ID']), ['DNE-NAME'])).rejects.toThrow(PackageLoadError);
            });
        });
    });

    describe('Project.clean()', () => {
        const registryPath = path.join(testCaseDir, 'registry');
        const localPackagesPath = path.join(testCaseDir, 'local-packages');
        const projectPath = path.join(testCaseDir, 'project');

        beforeEach(async () => {
            // If the registry dir exists, remove it
            if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // If the project dir exists, remove it
            if (fs.existsSync(projectPath)) fs.rmSync(projectPath, { recursive: true, force: true });
            // create the registry
            await Registry.create(registryPath);
            // create the local packages dir
            fs.mkdirSync(localPackagesPath, { recursive: true });
        });

        it('ten direct dependencies, each depending on the same common dependency', async () => {
            // create the common dependency
            const pkgCommonDep = await createPackage(
                path.join(localPackagesPath, 'pkgCommonDep.apm'),
                'pkgCommonDep',
                depend([]),
                new Map(),
            );
            // create the remaining packages
            const remainingPkgs = await Promise.all(
                Array.from({ length: 10 }, (_, i) =>
                    createPackage(
                        path.join(localPackagesPath, `pkg${i}.apm`),
                        `pkg${i}`,
                        depend([pkgCommonDep]),
                        new Map(),
                    ),
                ),
            );
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the packages in the registry
            await registry.put(pkgCommonDep);
            await Promise.all(remainingPkgs.map((pkg) => registry.put(pkg)));

            // create the deps
            const deps = new Set<string>([...remainingPkgs.map((pkg) => pkg.id), pkgCommonDep.id]);

            // create the project dir
            fs.mkdirSync(projectPath, { recursive: true });

            // create the project
            let project = await Project.init(projectPath, { projectName: 'TestProject', deps });

            // get the project tree
            const projectTree = await registry.getProjectTree(project.directDeps);
            // get the install dependencies
            const installDeps = projectTree.flatMap((tree) => tree.getTopologicalSort());
            // install the project
            await project.install(installDeps);
            // reload the project
            project = await Project.load(projectPath);
            // expect that the project has some sources
            expect(project.dependencySources.length).toBeGreaterThan(0);
            // clean the project
            await project.clean();
            // reload the project
            project = await Project.load(projectPath);
            // expect that the project has no sources
            expect(project.dependencySources.length).toBe(0);
        });

        it('project was never installed', async () => {
            // create the common dependency
            const pkgCommonDep = await createPackage(
                path.join(localPackagesPath, 'pkgCommonDep.apm'),
                'pkgCommonDep',
                depend([]),
                new Map(),
            );
            // create the remaining packages
            const remainingPkgs = await Promise.all(
                Array.from({ length: 10 }, (_, i) =>
                    createPackage(
                        path.join(localPackagesPath, `pkg${i}.apm`),
                        `pkg${i}`,
                        depend([pkgCommonDep]),
                        new Map(),
                    ),
                ),
            );
            // load the registry
            const registry = await Registry.load(registryPath);
            // put the packages in the registry
            await registry.put(pkgCommonDep);
            await Promise.all(remainingPkgs.map((pkg) => registry.put(pkg)));

            // create the deps
            const deps = new Set<string>([...remainingPkgs.map((pkg) => pkg.id), pkgCommonDep.id]);

            // create the project dir
            fs.mkdirSync(projectPath, { recursive: true });

            // create the project
            let project = await Project.init(projectPath, { projectName: 'TestProject', deps });
            // expect that the project has no sources
            expect(project.dependencySources.length).toBe(0);
            // clean the project
            await project.clean();
            // reload the project
            project = await Project.load(projectPath);
            // expect that the project has no sources
            expect(project.dependencySources.length).toBe(0);
        });
    });

    describe('Project.check()', () => {
        const localPackagesPath = path.join(testCaseDir, 'local-packages');
        const projectName = 'APMTmpProject';
        const projectDir = path.join(os.tmpdir(), projectName);
        let project: Project;

        const writeFileInside = (relPath: string, content: string) => {
            const filePath = path.join(projectDir, relPath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        };

        const setRootSource = (files: Map<string, string>) => {
            const rootSourceDir = path.join(projectDir, projectName);
            // If the dir exists, remove it
            if (fs.existsSync(rootSourceDir)) fs.rmSync(rootSourceDir, { recursive: true, force: true });
            // Create the dir
            fs.mkdirSync(rootSourceDir, { recursive: true });
            // Create the files
            for (const [relPath, content] of files.entries()) {
                writeFileInside(path.join(projectName, relPath), content);
            }
        };

        beforeEach(async () => {
            // Remove the temporary directory if it exists
            if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
            // If the local packages dir exists, remove it
            if (fs.existsSync(localPackagesPath)) fs.rmSync(localPackagesPath, { recursive: true, force: true });
            // Create the temporary directory
            fs.mkdirSync(projectDir, { recursive: true });
            // Create the local packages directory
            fs.mkdirSync(localPackagesPath, { recursive: true });
            // Create the project
            project = await Project.init(projectDir, { projectName });
        });

        describe('success cases', () => {
            const genericTest = async (files: Map<string, string>) => {
                // Set the root source
                setRootSource(files);
                // reload the project
                project = await Project.load(projectDir);
                // Expect the project to check
                await expect(project.check()).resolves.toBeUndefined();
            };

            it('zero files in root source', async () => await genericTest(new Map()));

            it('one agda file', async () =>
                await genericTest(new Map([['file1.agda', `module ${projectName}.file1 where`]])));

            it('one agda file that defines a Nat', async () =>
                await genericTest(
                    new Map([
                        [
                            'file1.agda',
                            `
                            module ${projectName}.file1 where
                            open import Agda.Builtin.Nat
                            myNat : Nat
                            myNat = 0
                            `,
                        ],
                    ]),
                ));

            it('two agda files that both define Nats', async () =>
                await genericTest(
                    new Map([
                        [
                            'file1.agda',
                            `
                                module ${projectName}.file1 where
                                open import Agda.Builtin.Nat
                                myNat : Nat
                                myNat = 1
                                `,
                        ],
                        [
                            'file2.agda',
                            `
                                module ${projectName}.file2 where
                                open import Agda.Builtin.Nat
                                myNat : Nat
                                myNat = 2
                                `,
                        ],
                    ]),
                ));

            it('one agda file in subdir is correct', async () =>
                await genericTest(
                    new Map([
                        [
                            'subdir/file1.agda',
                            `
                                module ${projectName}.subdir.file1 where
                                open import Agda.Builtin.Nat
                                myNat : Nat
                                myNat = 1
                                `,
                        ],
                    ]),
                ));

            it('overriding grandchild package with one that the child CAN compile with', async () => {
                // create the grandchild package
                const pkgGrandchild = await createPackage(
                    path.join(localPackagesPath, 'pkgGrandchild.apm'),
                    'Grandchild',
                    depend([]),
                    new Map([
                        [
                            'Main.agda',
                            `
                                    module Grandchild.Main where
                                    open import Agda.Builtin.Nat
                                    myNat : Nat
                                    myNat = 1
                                    `,
                        ],
                    ]),
                );
                // create the override grandchild package (doesn't define myNat)
                const pkgGrandchildOverride = await createPackage(
                    path.join(localPackagesPath, 'pkgOverrideGrandchild.apm'),
                    'Grandchild',
                    depend([]),
                    new Map([
                        [
                            'Main.agda',
                            `
                                    module Grandchild.Main where
                                    open import Agda.Builtin.Nat
                                    myNat : Nat
                                    myNat = 2
                                `,
                        ],
                    ]),
                );
                // create the child package
                const pkgChild = await createPackage(
                    path.join(localPackagesPath, 'pkgChild.apm'),
                    'Child',
                    depend([pkgGrandchild]),
                    new Map([
                        [
                            'Main.agda',
                            `
                                    module Child.Main where
                                    open import Agda.Builtin.Nat
                                    open import Grandchild.Main
                                    childNat : Nat
                                    childNat = myNat
                                    `,
                        ],
                    ]),
                );
                // create the project
                project.directDeps.add(pkgGrandchildOverride.id);
                project.directDeps.add(pkgChild.id);
                // Write the direct deps file
                ProjectTest.writeDirectDepsFile(projectDir, project.directDeps);
                // install the packages
                await project.install([pkgGrandchildOverride, pkgChild]);
                // reload the project
                project = await Project.load(projectDir);
                // expect the project to check
                await project.check();
            });
        });

        describe('failure cases', () => {
            const genericTest = async (files: Map<string, string>) => {
                // Set the root source
                setRootSource(files);
                // reload the project
                project = await Project.load(projectDir);
                // Expect the project to check
                await expect(project.check()).rejects.toThrow(CheckProjectError);
            };

            it('empty agda file', async () => await genericTest(new Map([['file1.agda', ``]])));

            it('single agda file with invalid module name (omitting project name)', async () =>
                await genericTest(new Map([['file1.agda', `module file2 where`]])));

            it('single agda file with invalid module name (wrong file name)', async () =>
                await genericTest(new Map([['file1.agda', `module ${projectName}.file2 where`]])));

            it('single agda file importing nonexistent library', async () =>
                await genericTest(
                    new Map([
                        [
                            'file1.agda',
                            `
                            module ${projectName}.file1 where
                            open import MyAwesomeLibrary`,
                        ],
                    ]),
                ));

            it('two agda files where first in lexical order is wrong', async () =>
                await genericTest(
                    new Map([
                        [
                            'file1.agda',
                            `
                                    module ${projectName}.file1 where
                                    open import Agda.Builtin.Nat
                                    myNat : Nat
                                    myNat = abc
                                    `,
                        ],
                        [
                            'file2.agda',
                            `
                                    module ${projectName}.file2 where
                                    open import Agda.Builtin.Nat
                                    myNat : Nat
                                    myNat = 2
                                    `,
                        ],
                    ]),
                ));

            it('two agda files where second in lexical order is wrong', async () =>
                await genericTest(
                    new Map([
                        [
                            'file1.agda',
                            `
                                        module ${projectName}.file1 where
                                        open import Agda.Builtin.Nat
                                        myNat : Nat
                                        myNat = 1
                                        `,
                        ],
                        [
                            'file2.agda',
                            `
                                        module ${projectName}.file2 where
                                        open import Agda.Builtin.Nat
                                        myNat : Nat
                                        myNat = abc
                                        `,
                        ],
                    ]),
                ));

            it('one agda file in subdir is wrong', async () =>
                await genericTest(
                    new Map([
                        [
                            'subdir/file1.agda',
                            `
                            module ${projectName}.subdir.file1 where
                            open import Agda.Builtin.Nat
                            myNat : Nat
                            myNat = abc
                            `,
                        ],
                    ]),
                ));

            it('overriding grandchild package with one that the child cannot compile with', async () => {
                // create the grandchild package
                const pkgGrandchild = await createPackage(
                    path.join(localPackagesPath, 'pkgGrandchild.apm'),
                    'Grandchild',
                    depend([]),
                    new Map([
                        [
                            'Main.agda',
                            `
                                module Grandchild.Main where
                                open import Agda.Builtin.Nat
                                myNat : Nat
                                myNat = 1
                                `,
                        ],
                    ]),
                );
                // create the override grandchild package (doesn't define myNat)
                const pkgGrandchildOverride = await createPackage(
                    path.join(localPackagesPath, 'pkgOverrideGrandchild.apm'),
                    'Grandchild',
                    depend([]),
                    new Map([
                        [
                            'Main.agda',
                            `
                                module Grandchild.Main where
                                `,
                        ],
                    ]),
                );
                // create the child package
                const pkgChild = await createPackage(
                    path.join(localPackagesPath, 'pkgChild.apm'),
                    'Child',
                    depend([pkgGrandchild]),
                    new Map([
                        [
                            'Main.agda',
                            `
                                module Child.Main where
                                open import Agda.Builtin.Nat
                                open import Grandchild.Main
                                childNat : Nat
                                childNat = myNat
                                `,
                        ],
                    ]),
                );
                // create the project
                project.directDeps.add(pkgGrandchildOverride.id);
                project.directDeps.add(pkgChild.id);
                // Write the direct deps file
                ProjectTest.writeDirectDepsFile(projectDir, project.directDeps);
                // install the packages
                await project.install([pkgGrandchildOverride, pkgChild]);
                // reload the project
                project = await Project.load(projectDir);
                // expect the project to check
                await expect(project.check()).rejects.toThrow(CheckProjectError);
            });
        });
    });

    // describe('Project.add()', () => {
    //     const projectName = 'APMTmpProject';
    //     const projectDir = path.join(os.tmpdir(), projectName);
    //     const localPackagesPath = path.join(projectDir, 'local-packages');
    //     let project: Project;

    //     beforeEach(async () => {
    //         // Remove the temporary directory if it exists
    //         if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
    //         // Create the temporary directory
    //         fs.mkdirSync(projectDir, { recursive: true });
    //         // Create the local packages directory
    //         fs.mkdirSync(localPackagesPath, { recursive: true });
    //         // Create the project
    //         project = await Project.init(projectDir, { projectName });
    //     });

    //     describe('success cases', () => {
    //         it('add 1 dependency to empty project', async () => {
    //             // Create the dependency
    //             const pkg0 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg0.apm'),
    //                 'pkg0',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             // Expect the project to have no dependencies
    //             expect(project.directDeps).toEqual(new Set());
    //             // Add the dependency to the project
    //             await project.add(pkg0);
    //             // Expect the project to have the dependency
    //             expect(project.directDeps).toEqual(new Set([pkg0.id]));
    //             // reload the project
    //             const reloadedProject = await Project.load(projectDir);
    //             // Expect the project to have the dependency
    //             expect(reloadedProject.directDeps).toEqual(new Set([pkg0.id]));
    //         });

    //         it('add 1 dependency to project with 1 dependency', async () => {
    //             // Create the dependency
    //             const pkg0 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg0.apm'),
    //                 'pkg0',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             const pkg1 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg1.apm'),
    //                 'pkg1',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             // Expect the project to have no dependencies
    //             expect(project.directDeps).toEqual(new Set());
    //             // Add the dependency to the project
    //             await project.add(pkg0);
    //             // Expect the project to have the dependency
    //             expect(project.directDeps).toEqual(new Set([pkg0.id]));
    //             // reload the project
    //             const reloadedProject = await Project.load(projectDir);
    //             // Expect the project to have the dependency
    //             expect(reloadedProject.directDeps).toEqual(new Set([pkg0.id]));
    //             // Add the second dependency to the project
    //             await project.add(pkg1);
    //             // Expect the project to have the dependencies
    //             expect(project.directDeps).toEqual(new Set([pkg0.id, pkg1.id]));
    //             // reload the project
    //             const reloadedProject2 = await Project.load(projectDir);
    //             // Expect the project to have the dependencies
    //             expect(reloadedProject2.directDeps).toEqual(new Set([pkg0.id, pkg1.id]));
    //         });
    //     });

    //     describe('failure cases', () => {
    //         it('add a dependency that already exists', async () => {
    //             // Create the dependency
    //             const pkg0 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg0.apm'),
    //                 'pkg0',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             // Expect the project to have no dependencies
    //             expect(project.directDeps).toEqual(new Set());
    //             // Add the dependency to the project
    //             await project.add(pkg0);
    //             // Expect the project to have the dependency
    //             expect(project.directDeps).toEqual(new Set([pkg0.id]));
    //             // reload the project
    //             const reloadedProject = await Project.load(projectDir);
    //             // Expect the project to have the dependency
    //             expect(reloadedProject.directDeps).toEqual(new Set([pkg0.id]));
    //             // Add the dependency to the project AGAIN
    //             await expect(project.add(pkg0)).rejects.toThrow(ProjectAddError);
    //         });
    //     });
    // });

    // describe('Project.remove()', () => {
    //     const projectName = 'APMTmpProject';
    //     const projectDir = path.join(os.tmpdir(), projectName);
    //     const localPackagesPath = path.join(projectDir, 'local-packages');
    //     let project: Project;

    //     beforeEach(async () => {
    //         // Remove the temporary directory if it exists
    //         if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
    //         // Create the temporary directory
    //         fs.mkdirSync(projectDir, { recursive: true });
    //         // Create the local packages directory
    //         fs.mkdirSync(localPackagesPath, { recursive: true });
    //         // Create the project
    //         project = await Project.init(projectDir, { projectName });
    //     });

    //     describe('success cases', () => {
    //         it('remove 1 dependency from project with 1 dependency', async () => {
    //             // Create the dependency
    //             const pkg0 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg0.apm'),
    //                 'pkg0',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             // Add the dependency to the project
    //             await project.add(pkg0);
    //             // reload the project
    //             const reloadedProject = await Project.load(projectDir);
    //             // Remove the dependency from the project
    //             await project.remove(pkg0);
    //             // Expect the project to have no dependencies
    //             expect(project.directDeps).toEqual(new Set());
    //             // reload the project
    //             const reloadedProject2 = await Project.load(projectDir);
    //             // Expect the project to have no dependencies
    //             expect(reloadedProject2.directDeps).toEqual(new Set());
    //         });

    //         it('remove 1 dependency from project with 2 dependencies', async () => {
    //             // Create the dependencies
    //             const pkg0 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg0.apm'),
    //                 'pkg0',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             const pkg1 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg1.apm'),
    //                 'pkg1',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             // Add the dependencies to the project
    //             await project.add(pkg0);
    //             await project.add(pkg1);
    //             // Expect the project to have the dependencies
    //             expect(project.directDeps).toEqual(new Set([pkg0.id, pkg1.id]));
    //             // reload the project
    //             const reloadedProject = await Project.load(projectDir);
    //             // Remove the dependency from the project
    //             await project.remove(pkg0);
    //             // Expect the project to have the dependency
    //             expect(project.directDeps).toEqual(new Set([pkg1.id]));
    //             // reload the project
    //             const reloadedProject2 = await Project.load(projectDir);
    //             // Expect the project to have the dependency
    //             expect(reloadedProject2.directDeps).toEqual(new Set([pkg1.id]));
    //         });
    //     });

    //     describe('failure cases', () => {
    //         it('remove a dependency that is not in the project', async () => {
    //             // Create the dependency
    //             const pkg0 = await createPackage(
    //                 path.join(localPackagesPath, 'pkg0.apm'),
    //                 'pkg0',
    //                 depend([]),
    //                 new Map(),
    //             );
    //             // Add the dependency to the project AGAIN
    //             await expect(project.remove(pkg0)).rejects.toThrow(ProjectRemoveError);
    //         });
    //     });
    // });
});
