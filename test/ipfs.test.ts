import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { pack, tree } from '../src/client';
import { install, Kubo, readInstalled, writeManifest } from '../src/core';
import { hasLocally, IPFS_BIN, readTree, startNode, TestNode, tmpDir, writeTree } from './helpers';

/** A package folder with the given files and dependencies. */
function project(files: Record<string, string>, deps: string[] = []): string {
    const dir = tmpDir('dpm-pkg-');
    writeTree(dir, files);
    writeManifest(dir, { deps });
    return dir;
}

/**
 * Runs the stock `ipfs` command against `node`, as a user would. Asynchronously: DPM servers run in this same
 * process, so blocking would stop them from answering.
 */
async function ipfs(node: Kubo, ...args: string[]): Promise<string> {
    return ipfsWithInput(node, '', ...args);
}

/** The same, with `input` piped to its stdin: e.g. `dpm package tree <cid> --flat | ipfs pin add`. */
async function ipfsWithInput(node: Kubo, input: string, ...args: string[]): Promise<string> {
    const port = new URL(node.api).port;
    const run = promisify(execFile)(IPFS_BIN as string, [`--api=/ip4/127.0.0.1/tcp/${port}`, ...args]);
    run.child.stdin?.end(input);
    return (await run).stdout.trim();
}

/** What a user runs to publish a project: dpm pack. Returns the CID. */
const publish = (dir: string, node: Kubo) => pack(dir, node);

/**
 * The CID a project would have, without adding it anywhere: a package nobody has. (The test projects have no
 * deps/ or hidden files, and the test nodes use the unixfs-v1-2025 profile, so plain `ipfs add` gives the CID.)
 */
const unpublished = (dir: string, node: Kubo) => ipfs(node, 'add', '-r', '-Q', '--only-hash', dir);

/** What a user runs to fetch from another node: ipfs swarm peering add <its address>. */
async function peer(node: TestNode, other: TestNode): Promise<void> {
    await ipfs(node, 'swarm', 'peering', 'add', ...(await other.id()).addresses);
}

describe.skipIf(!IPFS_BIN)('DPM over IPFS (real Kubo nodes)', { timeout: 60_000 }, () => {
    if (!IPFS_BIN) it.skip('needs the ipfs binary: set IPFS_BIN or put Kubo on the PATH', () => undefined);

    describe('dpm pack', () => {
        it('adds the package to Kubo, which pins it, and returns its CID', async () => {
            const kubo = await startNode();
            const cid = await pack(project({ 'Kant/Ethics.ul': 'duty' }), kubo);
            expect(cid).toMatch(/^bafy/);
            expect(await kubo.pins()).toContain(cid);
        });

        it('gives the same package the same CID on any node, whatever its import settings', async () => {
            // b doesn't use the unixfs-v1-2025 profile: dpm sends those settings with every add.
            const [a, b] = await Promise.all([startNode(), startNode({ profile: 'test' })]);
            const dir = project({ 'Kant/Ethics.ul': 'duty : \\X. good X => ought X;\n' });
            const cid = await pack(dir, a);
            expect(await pack(dir, b)).toBe(cid);
            // The same CID plain `ipfs add -r` gives on a node with the profile.
            expect(await ipfs(a, 'add', '-r', '-Q', '--only-hash', dir)).toBe(cid);
        });

        it("leaves out deps/ and hidden files: they aren't part of the package", async () => {
            const kubo = await startNode();
            const dir = project({ 'Kant/Ethics.ul': 'x' });
            const before = await pack(dir, kubo);
            writeTree(dir, { 'deps/something/file': 'installed', '.git/HEAD': 'ref' });
            const cid = await pack(dir, kubo);
            expect(cid).toBe(before);
            const out = path.join(tmpDir(), 'got');
            await ipfs(kubo, 'get', cid, '-o', out);
            expect(readTree(out)).toEqual({ 'Kant/Ethics.ul': 'x', 'dpm.json': '{\n    "deps": []\n}\n' });
        });

        it("refuses a folder without dpm.json: it isn't a DPM package", async () => {
            const kubo = await startNode();
            const dir = tmpDir();
            writeTree(dir, { 'Kant/Ethics.ul': 'x' });
            await expect(pack(dir, kubo)).rejects.toThrow(/is not a DPM project/);
        });
    });

    describe('tree', () => {
        it('lists a package and everything it depends on, each once', async () => {
            const kubo = await startNode();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), kubo);
            const alice = await publish(project({ 'Alice/Beliefs.ul': 'a' }, [base]), kubo);
            const bob = await publish(project({ 'Bob/Beliefs.ul': 'b' }, [base]), kubo);
            const app = await publish(project({}, [alice, bob]), kubo);
            expect((await tree(app, kubo)).sort()).toEqual([app, alice, bob, base].sort());
            expect(await tree(base, kubo)).toEqual([base]);
        });

        it('fails, printing nothing, when the tree cannot be completed', async () => {
            const author = await startNode();
            const missing = await unpublished(project({ 'Nowhere/X.ul': 'gone' }), author);
            const present = await publish(project({ 'Kant/Ethics.ul': 'duty' }, [missing]), author);
            const quick = new Kubo(author.api, '2s');
            await expect(tree(present, quick)).rejects.toThrow(`Could not fetch ${missing}`);
        });

        it("fails on a dependency that isn't a DPM package", async () => {
            const kubo = await startNode();
            const plain = tmpDir();
            writeTree(plain, { 'photo.txt': 'not a package' });
            const notPackage = await ipfs(kubo, 'add', '-r', '-Q', plain);
            const app = await publish(project({}, [notPackage]), kubo);
            await expect(tree(app, kubo)).rejects.toThrow(`${notPackage} is not a DPM package`);
        });
    });

    describe('install', () => {
        /** Two nodes: an author's, and a reader's that starts empty and is connected to the author's. */
        async function world() {
            const [author, reader] = await Promise.all([startNode(), startNode()]);
            await peer(reader, author);
            return { author, reader };
        }

        it('installs the whole tree into flat deps/<cid>/ folders, each package once', async () => {
            const { author, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            // A diamond: alice and bob both depend on base.
            const alice = await publish(project({ 'Alice/Beliefs.ul': 'a' }, [base]), author);
            const bob = await publish(project({ 'Bob/Beliefs.ul': 'b' }, [base]), author);

            const app = project({}, [alice, bob]);
            const graph = await install(app, reader);
            expect(Object.keys(graph.packages).sort()).toEqual([alice, base, bob].sort());
            expect(graph.packages[alice]?.deps).toEqual([base]);
            expect(readTree(path.join(app, 'deps'))).toMatchObject({
                [`${base}/Kant/Ethics.ul`]: 'duty',
                [`${alice}/Alice/Beliefs.ul`]: 'a',
                [`${bob}/Bob/Beliefs.ul`]: 'b',
            });
            // Nothing else is written: the installed tree is read back from the packages' own dpm.json files.
            expect(fs.readdirSync(path.join(app, 'deps')).sort()).toEqual([alice, base, bob].sort());
            expect(readInstalled(app)).toEqual(graph);
        });

        it('installs without pinning; the user pins what they decide to keep with ipfs pin add', async () => {
            const { author, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const alice = await publish(project({ 'Alice/Beliefs.ul': 'a' }, [base]), author);
            await install(project({}, [alice]), reader);
            // Installed, and cached in the node, but not pinned.
            expect(await hasLocally(reader, alice)).toBe(true);
            expect(await reader.pins()).not.toContain(alice);
            expect(await reader.pins()).not.toContain(base);
            // ...the user runs their checks here, then pins Alice's package alone...
            await ipfs(reader, 'pin', 'add', alice);
            expect(await reader.pins()).toContain(alice);
            expect(await reader.pins()).not.toContain(base);
            // ...or its whole tree: dpm package tree <cid> --flat | ipfs pin add
            await ipfsWithInput(reader, (await tree(alice, reader)).join('\n') + '\n', 'pin', 'add');
            expect(await reader.pins()).toEqual(expect.arrayContaining([alice, base]));
        });

        it('removes packages no longer needed when reinstalling', async () => {
            const { author, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const other = await publish(project({ 'Other/X.ul': 'x' }), author);
            const app = project({}, [base, other]);
            await install(app, reader);
            writeManifest(app, { deps: [base] });
            // A deps/graph.json from DPM 0.3.1 or earlier is removed too.
            fs.writeFileSync(path.join(app, 'deps', 'graph.json'), '{}');
            await install(app, reader);
            expect(fs.readdirSync(path.join(app, 'deps'))).toEqual([base]);
        });

        it('fails, naming the package, when a dependency cannot be found anywhere', async () => {
            const author = await startNode();
            const missing = await unpublished(project({ 'Nowhere/X.ul': 'gone' }), author);
            const reader = new Kubo((await startNode()).api, '2s');
            await expect(install(project({}, [missing]), reader)).rejects.toThrow(`Could not fetch ${missing}`);
        });

        it('fails, naming the package, when the tree cannot be completed, and installs nothing', async () => {
            const { author, reader } = await world();
            const missing = await unpublished(project({ 'Nowhere/X.ul': 'gone' }), author);
            const present = await publish(project({ 'Kant/Ethics.ul': 'duty' }, [missing]), author);
            const app = project({}, [present]);
            // Get the package that exists first, so the short timeout below is only spent on the missing one.
            await reader.fetch(present);
            await expect(install(app, new Kubo(reader.api, '2s'))).rejects.toThrow(`Could not fetch ${missing}`);
            expect(fs.existsSync(path.join(app, 'deps'))).toBe(false);
        });
    });

    describe('reading through a Kubo that requires a secret (e.g. on another machine)', () => {
        /** The commands dpm uses, and nothing else: see docs/ipfs.md. */
        const READ = ['/api/v0/cat', '/api/v0/refs', '/api/v0/get', '/api/v0/version'];

        it('installs and lists trees with a token allowed only the read commands, which can do nothing else', async () => {
            const author = await startNode();
            const node = await startNode({
                authorizations: {
                    admin: { AuthSecret: 'bearer:admin-secret', AllowedPaths: ['/api/v0'] },
                    dpm: { AuthSecret: 'bearer:read-only', AllowedPaths: READ },
                },
                auth: 'bearer:admin-secret',
            });
            await node.connect((await author.id()).addresses[0] as string);
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await publish(project({ 'App/Main.ul': 'm' }, [base]), author);

            const reader = new Kubo(node.api, '20s', 'bearer:read-only');
            expect((await tree(app, reader)).sort()).toEqual([app, base].sort());
            const dir = project({}, [app]);
            await install(dir, reader);
            expect(readTree(path.join(dir, 'deps'))).toMatchObject({ [`${base}/Kant/Ethics.ul`]: 'duty' });

            // The same token can't change anything, and no token gets nothing.
            const readerAsAdmin = new TestNode(node.api, '20s', 'bearer:read-only');
            await expect(readerAsAdmin.pin(app)).rejects.toThrow(/Access Denied/);
            await expect(readerAsAdmin.gc()).rejects.toThrow(/Access Denied/);
            await expect(new Kubo(node.api, '20s').version()).rejects.toThrow(/Access Denied/);
        });
    });
});
