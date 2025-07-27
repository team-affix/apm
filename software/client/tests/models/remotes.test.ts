import { Remotes } from '../../src/models/remotes';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { describe, test, expect, beforeEach } from '@jest/globals';

describe('Remotes', () => {

    // The temporary directory for the test case
    let testCaseDir: string;

    // Create the temporary directory for the test case
    beforeEach(() => {
        testCaseDir = path.join(os.tmpdir(), 'apm-client-tests', 'remotes');
        if (fs.existsSync(testCaseDir))
            fs.rmSync(testCaseDir, { recursive: true });
        fs.mkdirSync(testCaseDir, { recursive: true });
    });

    describe('create()', () => {
        test('create a remotes file, text should be "{}"', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            Remotes.create(remotesPath);
            expect(fs.existsSync(remotesPath)).toBe(true);
            const txt = fs.readFileSync(remotesPath, 'utf8');
            expect(txt).toBe('{}');
        });
    });

    describe('load()', () => {
        test('load an empty remotes file', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            fs.writeFileSync(remotesPath, '{}');
            const remotes = Remotes.load(remotesPath);
            expect((remotes as any).raw.size).toBe(0);
        });

        test('load a remotes file with one remote', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            const remote1name = 'default';
            const remote1url = 'https://revival.org';
            fs.writeFileSync(remotesPath, `{"${remote1name}": "${remote1url}"}`);
            const remotes = Remotes.load(remotesPath);
            expect((remotes as any).raw.size).toBe(1);
            expect((remotes as any).raw.get(remote1name)).toBe(remote1url);
        });

        test('load a remotes file with two remotes, no newlines', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            const remote1name = 'default';
            const remote1url = 'https://revival.org';
            const remote2name = 'remote2';
            const remote2url = 'https://derek.org/';
            fs.writeFileSync(remotesPath, `{"${remote1name}": "${remote1url}", "${remote2name}": "${remote2url}"}`);
            const remotes = Remotes.load(remotesPath);
            expect((remotes as any).raw.size).toBe(2);
            expect((remotes as any).raw.get(remote1name)).toBe(remote1url);
            expect((remotes as any).raw.get(remote2name)).toBe(remote2url);
        });

        test('load a remotes file with two remotes, with newlines', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            const remote1name = 'default';
            const remote1url = 'https://revival.org';
            const remote2name = 'remote2';
            const remote2url = 'https://derek.org/';
            fs.writeFileSync(remotesPath, `{"${remote1name}": "${remote1url}",\n"${remote2name}": "${remote2url}"}`);
            const remotes = Remotes.load(remotesPath);
            expect((remotes as any).raw.size).toBe(2);
            expect((remotes as any).raw.get(remote1name)).toBe(remote1url);
            expect((remotes as any).raw.get(remote2name)).toBe(remote2url);
        });
    });

    describe('save()', () => {
        test('Create empty remotes file, then save it', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            Remotes.create(remotesPath);
            const txtBefore = fs.readFileSync(remotesPath, 'utf8');
            const remotes = Remotes.load(remotesPath);
            remotes.save();
            const txtAfter = fs.readFileSync(remotesPath, 'utf8');
            expect(txtAfter).toBe(txtBefore);
        });

        test('Create remotes file with one remote, then save it', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            Remotes.create(remotesPath);
            const remotes = Remotes.load(remotesPath);
            const remote1name = 'default';
            const remote1url = 'https://revival.org';
            (remotes as any).raw.set(remote1name, remote1url);
            remotes.save();
            const txtAfter = fs.readFileSync(remotesPath, 'utf8');
            console.log(txtAfter);
            expect(txtAfter).toBe(`{\n    "${remote1name}": "${remote1url}"\n}`);
        });

        test('Create remotes file with two remotes, then save it', () => {
            const remotesPath = path.join(testCaseDir, 'remotes.json');
            Remotes.create(remotesPath);
            const remotes = Remotes.load(remotesPath);
            const remote1name = 'default';
            const remote1url = 'https://revival.org';
            const remote2name = 'remote2';
            const remote2url = 'https://derek.org/';
            (remotes as any).raw.set(remote1name, remote1url);
            (remotes as any).raw.set(remote2name, remote2url);
            remotes.save();
            const txtAfter = fs.readFileSync(remotesPath, 'utf8');
            console.log(txtAfter);
            expect(txtAfter).toBe(`{\n    "${remote1name}": "${remote1url}",\n    "${remote2name}": "${remote2url}"\n}`);
        });
    });

    describe('add()', () => {
        describe('success cases', () => {
            test('add a remote to an empty remotes file', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                remotes.add(remote1name, remote1url);
                expect((remotes as any).raw.size).toBe(1);
                expect((remotes as any).raw.get(remote1name)).toBe(remote1url);
            });

            test('add a remote to a remotes file with one remote', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                fs.writeFileSync(remotesPath, `{"${remote1name}": "${remote1url}"}`);
                const remotes = Remotes.load(remotesPath);
                const remote2name = 'remote2';
                const remote2url = 'https://derek.org/';
                remotes.add(remote2name, remote2url);
                expect((remotes as any).raw.size).toBe(2);
                expect((remotes as any).raw.get(remote1name)).toBe(remote1url);
                expect((remotes as any).raw.get(remote2name)).toBe(remote2url);
            });
        });

        describe('failure cases', () => {
            test('add a remote with a name that already exists', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                (remotes as any).raw.set(remote1name, remote1url);
                expect(() => remotes.add(remote1name, 'https://somethingelse.org')).toThrow();
            });
        });
    });

    describe('remove()', () => {
        describe('success cases', () => {
            test('remove the only remote from a remotes file', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                (remotes as any).raw.set(remote1name, remote1url);
                remotes.remove(remote1name);
                expect((remotes as any).raw.size).toBe(0);
            });

            test('remove a remote from a remotes file with two remotes', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                const remote2name = 'remote2';
                const remote2url = 'https://derek.org/';
                (remotes as any).raw.set(remote1name, remote1url);
                (remotes as any).raw.set(remote2name, remote2url);
                remotes.remove(remote1name);
                expect((remotes as any).raw.size).toBe(1);
                expect((remotes as any).raw.get(remote2name)).toBe(remote2url);
            });
        });

        describe('failure cases', () => {
            test('remove a remote from empty remotes file', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                expect(() => remotes.remove(remote1name)).toThrow();
            });

            test('remove a remote that does not exist from a remotes file with one remote', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                (remotes as any).raw.set(remote1name, remote1url);
                const remote2name = 'remote2';
                expect(() => remotes.remove(remote2name)).toThrow();
            });
        });
    });

    describe('get()', () => {
        describe('success cases', () => {
            test('get a remote from a remotes file with one remote', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                (remotes as any).raw.set(remote1name, remote1url);
                expect(remotes.get(remote1name)).toBe(remote1url);
            });
        });

        describe('failure cases', () => {
            test('get a remote from an empty remotes file', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                expect(() => remotes.get(remote1name)).toThrow();
            });

            test('get a remote that does not exist from a remotes file with one remote', () => {
                const remotesPath = path.join(testCaseDir, 'remotes.json');
                Remotes.create(remotesPath);
                const remotes = Remotes.load(remotesPath);
                const remote1name = 'default';
                const remote1url = 'https://revival.org';
                (remotes as any).raw.set(remote1name, remote1url);
                const remote2name = 'remote2';
                expect(() => remotes.get(remote2name)).toThrow();
            });
        });
    });
});
