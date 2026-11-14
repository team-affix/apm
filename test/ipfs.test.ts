import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { cidOf, installProject, pack, push, Remote } from '../src/client';
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
            for (const cid of [alice, bob]) expect((await push(cid, [home], author))[0]?.status.status).toBe('pinned');

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

        it('runs the check with dependencies installed, so it can look at the whole tree', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            const { url } = await startServer({ kubo: serverNode, policy: commandPolicy('cat deps/graph.json') });
            const base = await pack(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const app = await pack(project({ 'App/Main.ul': 'm' }, [base]), author);
            expect((await push(app, [{ name: 'home', url }], author))[0]?.status.status).toBe('pinned');
            expect(await serverNode.pins()).toEqual(expect.arrayContaining([app, base]));
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
            const { url } = await startServer({ kubo: serverNode });
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
        });

        it('rejects a request that is not for a CID', async () => {
            const { url } = await startServer({ kubo: await startNode() });
            await expect(new PinningService(url).add({ cid: 'Kant@123' })).rejects.toThrow(
                /400 BAD_REQUEST: Not a CID/,
            );
        });
    });
});
