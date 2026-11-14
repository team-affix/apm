import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { cidOf, installProject, pack, Remote, remoteNode, status, tree } from '../src/client';
import { Kubo, PinningService, readGraph, writeManifest } from '../src/core';
import { commandPolicy } from '../src/server';
import { IPFS_BIN, readTree, startNode, startServer, tmpDir, writeTree } from './helpers';

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
async function ipfs(node: Kubo | string, ...args: string[]): Promise<string> {
    const port = new URL(typeof node === 'string' ? node : node.api).port;
    const { stdout } = await promisify(execFile)(IPFS_BIN as string, [`--api=/ip4/127.0.0.1/tcp/${port}`, ...args]);
    return stdout.trim();
}

/** What a user runs to publish a project: ipfs add -r -Q "$(dpm pack)". Returns the CID. */
async function publish(dir: string, node: Kubo): Promise<string> {
    const { folder } = await pack(dir, node);
    return ipfs(node, 'add', '-r', '-Q', folder);
}

/** What a user runs to push a CID to a server: ipfs pin remote add --service=<server> <cid>. */
async function push(node: Kubo, server: Remote, cid: string, token = 'none'): Promise<string> {
    const services = await ipfs(node, 'pin', 'remote', 'service', 'ls');
    if (!services.split('\n').some((l) => l.startsWith(`${server.name} `)))
        await ipfs(node, 'pin', 'remote', 'service', 'add', server.name, server.url, token);
    return ipfs(node, 'pin', 'remote', 'add', `--service=${server.name}`, cid);
}

/** dpm tree <cid> | xargs -n1 ipfs pin remote add --service=<server> */
async function pushTree(node: Kubo, server: Remote, cid: string): Promise<void> {
    for (const c of await tree(cid, node)) await push(node, server, c);
}

const REFUSED = /remote service failed to pin/;

describe.skipIf(!IPFS_BIN)('DPM over IPFS (real Kubo nodes)', { timeout: 60_000 }, () => {
    if (!IPFS_BIN) it.skip('needs the ipfs binary: set IPFS_BIN or put Kubo on the PATH', () => undefined);

    describe('identity', () => {
        it('gives a project the CID that ipfs add gives its packed folder, on any node', async () => {
            const [a, b] = await Promise.all([startNode(), startNode()]);
            const dir = project({ 'Kant/Ethics.ul': 'duty : \\X. good X => ought X;\n' });
            const cid = await publish(dir, a);
            expect((await pack(dir, a)).cid).toBe(cid);
            expect(await cidOf(dir, a)).toBe(cid);
            expect(await cidOf(dir, b)).toBe(cid);
            expect(cid).toMatch(/^bafy/);
        });

        it("packs without deps/ and hidden files: they aren't part of the package", async () => {
            const kubo = await startNode();
            const dir = project({ 'Kant/Ethics.ul': 'x' });
            const before = await cidOf(dir, kubo);
            writeTree(dir, { 'deps/something/file': 'installed', '.git/HEAD': 'ref' });
            const { folder } = await pack(dir, kubo);
            expect(readTree(folder)).toEqual({ 'Kant/Ethics.ul': 'x', 'dpm.json': '{\n    "deps": []\n}\n' });
            expect(await cidOf(dir, kubo)).toBe(before);
            writeTree(dir, { 'Kant/More.ul': 'y' });
            expect(await cidOf(dir, kubo)).not.toBe(before);
        });

        it("refuses to pack a folder without dpm.json: it isn't a DPM package", async () => {
            const kubo = await startNode();
            const dir = tmpDir();
            writeTree(dir, { 'Kant/Ethics.ul': 'x' });
            await expect(pack(dir, kubo)).rejects.toThrow(/is not a DPM project/);
        });

        it('packs into a folder of your choosing, but never over an existing one', async () => {
            const kubo = await startNode();
            const dir = project({ 'Kant/Ethics.ul': 'x' });
            const out = path.join(tmpDir(), 'out', 'kant');
            const { folder, cid } = await pack(dir, kubo, out);
            expect(folder).toBe(out);
            expect(readTree(out)).toEqual({ 'Kant/Ethics.ul': 'x', 'dpm.json': '{\n    "deps": []\n}\n' });
            expect(await ipfs(kubo, 'add', '-r', '-Q', out)).toBe(cid);
            await expect(pack(dir, kubo, out)).rejects.toThrow(/already exists/);
        });

        it('pack and cid store nothing in the node', async () => {
            const kubo = await startNode();
            const dir = project({ 'Kant/Ethics.ul': 'x' });
            const { cid } = await pack(dir, kubo);
            expect(await cidOf(dir, kubo)).toBe(cid);
            expect(await kubo.hasLocally(cid)).toBe(false);
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
            const missing = await cidOf(project({ 'Nowhere/X.ul': 'gone' }), author);
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

    describe('push and install', () => {
        /** Three nodes: the author's, a server's, and a reader's that starts empty. */
        async function world() {
            const [author, serverNode, reader] = await Promise.all([startNode(), startNode(), startNode()]);
            const { url, server } = await startServer({ kubo: serverNode });
            const home: Remote = { name: 'home', url };
            return { author, serverNode, reader, home, server };
        }

        it('pushes with ipfs pin remote add: the server fetches from the author over IPFS', async () => {
            const { author, serverNode, home } = await world();
            const cid = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            expect(await push(author, home, cid)).toMatch(/Status: pinned/);
            expect(await serverNode.pins()).toContain(cid);
            expect(await status(cid, [home])).toMatchObject([{ remote: 'home', status: { status: 'pinned' } }]);
        });

        it('installs the whole tree into flat deps/<cid>/ folders, each package once, from the server', async () => {
            const { author, home, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            // A diamond: alice and bob both depend on base.
            const alice = await publish(project({ 'Alice/Beliefs.ul': 'a' }, [base]), author);
            const bob = await publish(project({ 'Bob/Beliefs.ul': 'b' }, [base]), author);
            // Each pushed with its tree, so the server keeps base too.
            await pushTree(author, home, alice);
            await pushTree(author, home, bob);

            const app = project({}, [alice, bob]);
            const graph = await installProject(app, reader, [home]);
            expect(Object.keys(graph.packages).sort()).toEqual([alice, base, bob].sort());
            expect(graph.packages[alice]?.deps).toEqual([base]);
            expect(readTree(path.join(app, 'deps'))).toMatchObject({
                [`${base}/Kant/Ethics.ul`]: 'duty',
                [`${alice}/Alice/Beliefs.ul`]: 'a',
                [`${bob}/Bob/Beliefs.ul`]: 'b',
            });
            expect(readGraph(app)).toEqual(graph);
        });

        it('installs without pinning; the user pins what they decide to keep with ipfs pin add', async () => {
            const { author, home, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const alice = await publish(project({ 'Alice/Beliefs.ul': 'a' }, [base]), author);
            await pushTree(author, home, alice);
            await installProject(project({}, [alice]), reader, [home]);
            // Installed, and cached in the node, but not pinned.
            expect(await reader.hasLocally(alice)).toBe(true);
            expect(await reader.packages()).toEqual([]);
            // ...the user runs their checks here, then pins Alice's package alone...
            await ipfs(reader, 'pin', 'add', alice);
            expect(await reader.packages()).toEqual([alice]);
            // ...or its whole tree: dpm tree <cid> | xargs -n1 ipfs pin add
            for (const c of await tree(alice, reader)) await ipfs(reader, 'pin', 'add', c);
            expect((await reader.packages()).sort()).toEqual([alice, base].sort());
        });

        it('removes packages no longer needed when reinstalling', async () => {
            const { author, home, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const other = await publish(project({ 'Other/X.ul': 'x' }), author);
            await push(author, home, base);
            await push(author, home, other);
            const app = project({}, [base, other]);
            await installProject(app, reader, [home]);
            writeManifest(app, { deps: [base] });
            await installProject(app, reader, [home]);
            expect(fs.readdirSync(path.join(app, 'deps')).sort()).toEqual([base, 'graph.json'].sort());
        });

        it('fails, naming the package, when a dependency cannot be found anywhere', async () => {
            const author = await startNode();
            const missing = await cidOf(project({ 'Nowhere/X.ul': 'gone' }), author);
            const reader = new Kubo((await startNode()).api, '2s');
            await expect(installProject(project({}, [missing]), reader, [])).rejects.toThrow(
                `Could not fetch ${missing}`,
            );
        });

        it('a server refuses a package whose tree cannot be completed', async () => {
            const { author, serverNode, home } = await world();
            const missing = await cidOf(project({ 'Nowhere/X.ul': 'gone' }), author);
            const present = await publish(project({ 'Kant/Ethics.ul': 'duty' }, [missing]), author);
            await expect(push(author, home, present)).rejects.toThrow(REFUSED);
            const [s] = await status(present, [home]);
            expect(s?.status?.status).toBe('failed');
            expect(s?.status?.info?.reason).toContain(`Could not fetch ${missing}`);
            expect(await serverNode.pins()).not.toContain(present);
        }, 120_000);
    });

    describe('server policy', () => {
        it('keeps a package only if its check command succeeds, and says why it refused', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            // The check: every package must contain a README.
            const { url } = await startServer({ kubo: serverNode, policy: commandPolicy('test -f README') });
            const home = { name: 'home', url };

            const good = await publish(project({ README: 'hi', 'Kant/Ethics.ul': 'duty' }), author);
            const bad = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            expect(await push(author, home, good)).toMatch(/Status: pinned/);
            await expect(push(author, home, bad)).rejects.toThrow(REFUSED);
            const [refused] = await status(bad, [home]);
            expect(refused?.status?.status).toBe('failed');
            expect(refused?.status?.info?.reason).toMatch(/'test -f README' failed/);
            const pins = await serverNode.pins();
            expect(pins).toContain(good);
            expect(pins).not.toContain(bad);
        });

        it('deletes what it refused, so its node stops serving it', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url, server } = await startServer({ kubo: serverNode, policy: async () => 'refused' });
            const cid = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            await expect(push(author, { name: 'home', url }, cid)).rejects.toThrow(REFUSED);
            await server.idle();
            expect(await serverNode.hasLocally(cid)).toBe(false);
        });

        it('runs the check with dependencies installed, so it can look at the whole tree', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url, server } = await startServer({
                kubo: serverNode,
                // The check can see the dependency's files under deps/.
                policy: commandPolicy('ls deps/*/Kant/Ethics.ul'),
            });
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await publish(project({ 'App/Main.ul': 'm' }, [base]), author);
            expect(await push(author, { name: 'home', url }, app)).toMatch(/Status: pinned/);
            // By default it pins only what was pushed. The dependency was fetched for the check and isn't pinned:
            // like any data a Kubo node fetches, it stays cached until garbage collection.
            await server.idle();
            expect(await serverNode.pins()).toContain(app);
            expect(await serverNode.pins()).not.toContain(base);
        });

        it('keeps dependencies too when configured to', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, keepDependencies: true });
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await publish(project({ 'App/Main.ul': 'm' }, [base]), author);
            await push(author, { name: 'home', url }, app);
            expect(await serverNode.pins()).toEqual(expect.arrayContaining([app, base]));
        });
    });

    describe('what counts as a DPM package', () => {
        it('lists every pinned folder with a dpm.json, however it was pinned, and nothing else', async () => {
            const kubo = await startNode();
            const mine = await publish(project({ 'Kant/Ethics.ul': 'duty' }), kubo);
            // Content another application stores and pins: a folder without dpm.json, and a single file.
            const folder = tmpDir();
            writeTree(folder, { 'photo.txt': 'not a package' });
            const theirs = await ipfs(kubo, 'add', '-r', '-Q', folder);
            const file = await ipfs(kubo, 'add', '-Q', path.join(folder, 'photo.txt'));
            expect(await kubo.pins()).toEqual(expect.arrayContaining([mine, theirs, file]));
            expect(await kubo.packages()).toEqual([mine]);
        });
    });

    describe('server API (IPFS Pinning Service API)', () => {
        it('requires a token to add or remove pins when tokens are set; reading is open', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, tokens: ['secret'] });
            const cid = await publish(project({ 'A/x.ul': 'x' }), author);
            await expect(new PinningService(url).add({ cid })).rejects.toThrow(/401/);
            await expect(new PinningService(url, 'wrong').add({ cid })).rejects.toThrow(/401/);
            expect(await push(author, { name: 'home', url }, cid, 'secret')).toMatch(/Status: pinned/);
            expect((await new PinningService(url).list({ cid: [cid] })).map((s) => s.pin.cid)).toEqual([cid]);
        });

        it('lists requests by CID and state, and releases what a removed request held', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url, server } = await startServer({ kubo: serverNode });
            const api = new PinningService(url);
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await publish(project({ 'App/Main.ul': 'm' }, [base]), author);
            const home = { name: 'home', url };
            await push(author, home, app);
            await push(author, home, base);
            const [first] = await api.list({ cid: [app] });
            const [second] = await api.list({ cid: [base] });
            expect(await api.list({ status: ['failed'] })).toEqual([]);

            // Removing the request for app releases app, but not base: another request still holds it.
            await api.remove(first?.requestid as string);
            const pins = await serverNode.pins();
            expect(pins).not.toContain(app);
            expect(pins).toContain(base);
            await api.remove(second?.requestid as string);
            expect(await serverNode.pins()).not.toContain(base);
            // ...and deletes it, so the node stops serving it.
            await server.idle();
            expect(await serverNode.hasLocally(base)).toBe(false);
        });

        it("answers in Kubo's own format which DPM packages it keeps, dependencies included", async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, keepDependencies: true });
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await publish(project({ 'App/Main.ul': 'm' }, [base]), author);
            await push(author, { name: 'home', url }, app);
            // Something else on the server's node, which isn't a DPM package.
            const folder = tmpDir();
            writeTree(folder, { 'photo.txt': 'x' });
            const other = await ipfs(serverNode, 'add', '-r', '-Q', folder);

            // The same client code as for a local node: its pins are exactly its DPM packages.
            const remote = remoteNode({ name: 'home', url });
            expect((await remote.pins()).sort()).toEqual([app, base].sort());
            expect(await remote.isPinned(base)).toBe(true);
            expect(await remote.isPinned(other)).toBe(false);
            expect((await remote.id()).id).toBe((await serverNode.id()).id);
        });

        it('works with the stock ipfs command, pointed at the server', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode });
            const cid = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            await push(author, { name: 'home', url }, cid);
            expect(await ipfs(url, 'pin', 'ls')).toBe(`${cid} recursive`);
        });

        it("forwards nothing else to the node's private API", async () => {
            const { url } = await startServer({ kubo: await startNode() });
            for (const command of ['pin/rm', 'pin/add', 'repo/gc', 'config', 'shutdown']) {
                const res = await fetch(`${url}/api/v0/${command}`, { method: 'POST' });
                expect(res.status).toBe(404);
            }
        });

        it('rejects a request that is not for a CID', async () => {
            const { url } = await startServer({ kubo: await startNode() });
            await expect(new PinningService(url).add({ cid: 'Kant@123' })).rejects.toThrow(
                /400 BAD_REQUEST: Not a CID/,
            );
        });
    });
});
