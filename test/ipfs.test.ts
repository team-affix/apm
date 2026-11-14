import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { cidOf, installProject, pack, pinTree, push, Remote, remoteNode } from '../src/client';
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

describe.skipIf(!IPFS_BIN)('DPM over IPFS (real Kubo nodes)', { timeout: 60_000 }, () => {
    if (!IPFS_BIN) it.skip('needs the ipfs binary: set IPFS_BIN or put Kubo on the PATH', () => undefined);

    describe('identity', () => {
        it('gives the same folder the same CID, on any node, stored or not', async () => {
            const [a, b] = await Promise.all([startNode(), startNode()]);
            const dir = project({ 'Kant/Ethics.ul': 'duty : \\X. good X => ought X;\n' });
            const cid = await pack(dir, a);
            expect(await cidOf(dir, a)).toBe(cid);
            expect(await cidOf(dir, b)).toBe(cid);
            expect(cid).toMatch(/^bafy/);
        });

        it("leaves out deps/ and hidden files: they aren't part of the package", async () => {
            const kubo = await startNode();
            const dir = project({ 'Kant/Ethics.ul': 'x' });
            const before = await cidOf(dir, kubo);
            writeTree(dir, { 'deps/something/file': 'installed', '.git/HEAD': 'ref' });
            expect(await cidOf(dir, kubo)).toBe(before);
            writeTree(dir, { 'Kant/More.ul': 'y' });
            expect(await cidOf(dir, kubo)).not.toBe(before);
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

        it('pushes without uploading: the server fetches from the author over IPFS', async () => {
            const { author, serverNode, home } = await world();
            const cid = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const [r] = await push(cid, [home], author);
            expect(r?.status.status).toBe('pinned');
            expect(await serverNode.pins()).toContain(cid);
        });

        it('installs the whole tree into flat deps/<cid>/ folders, each package once, from the server', async () => {
            const { author, home, reader } = await world();
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            // A diamond: alice and bob both depend on base.
            const alice = await pack(project({ 'Alice/Beliefs.ul': 'a' }, [base]), author);
            const bob = await pack(project({ 'Bob/Beliefs.ul': 'b' }, [base]), author);
            // Each pushed with its dependencies, so the server keeps base too.
            for (const cid of [alice, bob])
                for (const r of await push(cid, [home], author, 60_000, true)) expect(r.status.status).toBe('pinned');

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

        it('installs without pinning; dpm pin <cid> keeps a package and its whole tree', async () => {
            const { author, home, reader } = await world();
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const alice = await pack(project({ 'Alice/Beliefs.ul': 'a' }, [base]), author);
            await push(alice, [home], author, 60_000, true);
            await installProject(project({}, [alice]), reader, [home]);
            // Installed, and cached in the node, but not pinned.
            expect(await reader.hasLocally(alice)).toBe(true);
            expect(await reader.pins()).not.toEqual(expect.arrayContaining([alice]));
            expect(await reader.pins()).not.toEqual(expect.arrayContaining([base]));
            // ...the user runs their checks here, then pins Alice's package: Kant's comes with it.
            expect((await pinTree([alice], reader)).sort()).toEqual([alice, base].sort());
            expect((await reader.packages()).sort()).toEqual([alice, base].sort());
        });

        it('pins nothing with dpm pin when the tree cannot be completed', async () => {
            const { author, reader } = await world();
            const missing = await cidOf(project({ 'Nowhere/X.ul': 'gone' }), author);
            const present = await pack(project({ 'Kant/Ethics.ul': 'duty' }, [missing]), author);
            const quick = new Kubo(reader.api, '2s');
            await quick.connect((await author.id()).addresses[0] as string);
            await expect(pinTree([present], quick)).rejects.toThrow(`Could not fetch ${missing}`);
            expect(await reader.pins()).not.toContain(present);
        });

        it('removes packages no longer needed when reinstalling', async () => {
            const { author, home, reader } = await world();
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const other = await pack(project({ 'Other/X.ul': 'x' }), author);
            await push(base, [home], author);
            await push(other, [home], author);
            const app = project({}, [base, other]);
            await installProject(app, reader, [home]);
            writeManifest(app, { deps: [base] });
            await installProject(app, reader, [home]);
            expect(fs.readdirSync(path.join(app, 'deps')).sort()).toEqual([base, 'graph.json'].sort());
        });

        it('pins nothing when the tree cannot be completed', async () => {
            const { author, home, reader } = await world();
            const missing = await cidOf(project({ 'Nowhere/X.ul': 'gone' }), author);
            // present can be fetched, but depends on something nobody has.
            const present = await pack(project({ 'Kant/Ethics.ul': 'duty' }, [missing]), author);
            await expect(push(present, [home], author)).rejects.toThrow(`Could not fetch ${missing}`);
            // The reader can get present (from the author's node), and then fails on its missing dependency.
            const quick = new Kubo(reader.api, '2s');
            await quick.connect((await author.id()).addresses[0] as string);
            await expect(installProject(project({}, [present]), quick, [])).rejects.toThrow(
                `Could not fetch ${missing}`,
            );
            expect(await reader.hasLocally(present)).toBe(true);
            expect(await reader.pins()).not.toContain(present);
        });

        it('fails, naming the package, when a dependency cannot be found anywhere', async () => {
            const author = await startNode();
            const missing = await cidOf(project({ 'Nowhere/X.ul': 'gone' }), author);
            const app = project({}, [missing]);
            const reader = new Kubo((await startNode()).api, '2s');
            await expect(installProject(app, reader, [])).rejects.toThrow(`Could not fetch ${missing}`);
        });
    });

    describe('server policy', () => {
        it('keeps a package only if its check command succeeds, and says why it refused', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            // The check: every package must contain a README.
            const { url } = await startServer({ kubo: serverNode, policy: commandPolicy('test -f README') });
            const home = { name: 'home', url };

            const good = await pack(project({ README: 'hi', 'Kant/Ethics.ul': 'duty' }), author);
            const bad = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            expect((await push(good, [home], author))[0]?.status.status).toBe('pinned');
            const refused = (await push(bad, [home], author))[0]?.status;
            expect(refused?.status).toBe('failed');
            expect(refused?.info?.reason).toMatch(/'test -f README' failed/);
            const pins = await serverNode.pins();
            expect(pins).toContain(good);
            expect(pins).not.toContain(bad);
        });

        it('deletes what it refused, so its node stops serving it', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url, server } = await startServer({ kubo: serverNode, policy: async () => 'refused' });
            const cid = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            expect((await push(cid, [{ name: 'home', url }], author))[0]?.status.status).toBe('failed');
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
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await pack(project({ 'App/Main.ul': 'm' }, [base]), author);
            expect((await push(app, [{ name: 'home', url }], author))[0]?.status.status).toBe('pinned');
            // By default it pins only what was pushed. The dependency was fetched for the check and isn't pinned:
            // like any data a Kubo node fetches, it stays cached until garbage collection.
            await server.idle();
            expect(await serverNode.pins()).toContain(app);
            expect(await serverNode.pins()).not.toContain(base);
        });

        it('keeps dependencies too when configured to', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, keepDependencies: true });
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await pack(project({ 'App/Main.ul': 'm' }, [base]), author);
            await push(app, [{ name: 'home', url }], author);
            expect(await serverNode.pins()).toEqual(expect.arrayContaining([app, base]));
        });

        it('keeps dependencies pushed with --with-deps, each as its own request', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode });
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await pack(project({ 'App/Main.ul': 'm' }, [base]), author);
            const results = await push(app, [{ name: 'home', url }], author, 60_000, true);
            expect(results.map((r) => [r.cid, r.status.status])).toEqual([
                [base, 'pinned'],
                [app, 'pinned'],
            ]);
            expect(await serverNode.pins()).toEqual(expect.arrayContaining([app, base]));
        });
    });

    describe('sharing a node with other applications', () => {
        /** Another application pinning something on the same node, under its own name. */
        async function otherAppPins(kubo: Kubo, cid: string) {
            const res = await fetch(`${kubo.api}/api/v0/pin/add?arg=${cid}&name=other-app`, { method: 'POST' });
            expect(res.ok).toBe(true);
        }

        it("lists only DPM's packages, not other applications' content", async () => {
            const kubo = await startNode();
            const mine = await pack(project({ 'Kant/Ethics.ul': 'duty' }), kubo);
            // Content another application stores and pins under its own name.
            const theirs = await pack(project({ 'photo.txt': 'not a package' }), kubo);
            await otherAppPins(kubo, theirs);
            expect(await kubo.pins()).toEqual(expect.arrayContaining([mine, theirs]));
            expect(await kubo.packages()).toEqual([mine]);
        });

        it("never renames another application's pin of the same content", async () => {
            const [author, reader] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: await startNode() });
            const cid = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            await push(cid, [{ name: 'home', url }], author);
            await installProject(project({}, [cid]), reader, [{ name: 'home', url }]);
            await pinTree([cid], reader);
            expect(await reader.packages()).toEqual([cid]);
            // Another application pins the same content first on a fresh node: DPM leaves its pin alone.
            const shared = await startNode();
            await shared.connect((await author.id()).addresses[0] as string);
            await otherAppPins(shared, cid);
            await installProject(project({}, [cid]), shared, []);
            expect(await shared.pins()).toContain(cid);
            expect(await shared.packages()).toEqual([]);
        });
    });

    describe('server API (IPFS Pinning Service API)', () => {
        it('requires a token to add or remove pins when tokens are set; reading is open', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, tokens: ['secret'] });
            const cid = await pack(project({ 'A/x.ul': 'x' }), author);
            await expect(new PinningService(url).add({ cid })).rejects.toThrow(/401/);
            await expect(new PinningService(url, 'wrong').add({ cid })).rejects.toThrow(/401/);
            expect((await push(cid, [{ name: 'home', url, token: 'secret' }], author))[0]?.status.status).toBe(
                'pinned',
            );
            expect((await new PinningService(url).list({ cid: [cid] })).map((s) => s.pin.cid)).toEqual([cid]);
        });

        it('lists requests by CID and state, and releases what a removed request held', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url, server } = await startServer({ kubo: serverNode });
            const api = new PinningService(url);
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await pack(project({ 'App/Main.ul': 'm' }, [base]), author);
            const home = { name: 'home', url };
            const [first] = await push(app, [home], author);
            const [second] = await push(base, [home], author);

            expect((await api.list({ cid: [app] })).map((s) => s.requestid)).toEqual([first?.status.requestid]);
            expect(await api.list({ status: ['failed'] })).toEqual([]);

            // Removing the request for app releases app, but not base: another request still holds it.
            await api.remove(first?.status.requestid as string);
            const pins = await serverNode.pins();
            expect(pins).not.toContain(app);
            expect(pins).toContain(base);
            await api.remove(second?.status.requestid as string);
            expect(await serverNode.pins()).not.toContain(base);
            // ...and deletes it, so the node stops serving it.
            await server.idle();
            expect(await serverNode.hasLocally(base)).toBe(false);
        });

        it("answers in Kubo's own format which DPM packages it keeps, dependencies included", async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, keepDependencies: true });
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await pack(project({ 'App/Main.ul': 'm' }, [base]), author);
            await push(app, [{ name: 'home', url }], author);
            // Something else on the server's node, which isn't DPM's.
            const other = await pack(project({ 'photo.txt': 'x' }), serverNode);
            await fetch(`${serverNode.api}/api/v0/pin/add?arg=${other}&name=other-app`, { method: 'POST' });

            // The same client code as for a local node.
            const remote = remoteNode({ name: 'home', url });
            expect((await remote.packages()).sort()).toEqual([app, base].sort());
            expect(await remote.isPinned(base)).toBe(true);
            expect(await remote.isPinned(other)).toBe(false);
            expect((await remote.id()).id).toBe((await serverNode.id()).id);
        });

        it('works with the stock ipfs command, pointed at the server', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode });
            const cid = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            await push(cid, [{ name: 'home', url }], author);
            const port = new URL(url).port;
            // Asynchronously: the server runs in this same process, so blocking would stop it from answering.
            const { stdout: out } = await promisify(execFile)(IPFS_BIN as string, [
                `--api=/ip4/127.0.0.1/tcp/${port}`,
                'pin',
                'ls',
                '--names',
            ]);
            expect(out.trim()).toBe(`${cid} recursive dpm`);
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
