import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { pack, tree } from '../src/client';
import { install, Kubo, readGraph, writeManifest } from '../src/core';
import { commandPolicy, KuboAdmin, PinningService, PinStatus } from '../src/server';
import { hasLocally, IPFS_BIN, readTree, startNode, startServer, tmpDir, writeTree } from './helpers';

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

/** The same, with `input` piped to its stdin: e.g. `dpm tree <cid> | ipfs pin add`. */
async function ipfsWithInput(node: Kubo, input: string, ...args: string[]): Promise<string> {
    const port = new URL(node.api).port;
    const run = promisify(execFile)(IPFS_BIN as string, [`--api=/ip4/127.0.0.1/tcp/${port}`, ...args]);
    run.child.stdin?.end(input);
    return (await run).stdout.trim();
}

/** Packs a project to a temporary folder, runs `ipfs add -r -Q <folder> ...extra`, and removes the folder. */
async function addPacked(dir: string, node: Kubo, ...extra: string[]): Promise<string> {
    const folder = pack(dir);
    try {
        return await ipfs(node, 'add', '-r', '-Q', ...extra, folder);
    } finally {
        fs.rmSync(folder, { recursive: true });
    }
}

/** What a user runs to publish a project: ipfs add -r -Q "$(dpm pack)". Returns the CID. */
const publish = (dir: string, node: Kubo) => addPacked(dir, node);

/** The CID a project would have, without adding it anywhere: a package nobody has. */
const unpublished = (dir: string, node: Kubo) => addPacked(dir, node, '--only-hash');

/** A DPM server, as a user's Kubo knows it: a name for pushing, and its node's addresses for fetching. */
interface Server {
    name: string;
    url: string;
    delegates: readonly string[];
}

/** What a user runs to push a CID to a server: ipfs pin remote add --service=<server> <cid>. */
async function push(node: Kubo, server: Pick<Server, 'name' | 'url'>, cid: string, token = 'none'): Promise<string> {
    const services = await ipfs(node, 'pin', 'remote', 'service', 'ls');
    if (!services.split('\n').some((l) => l.startsWith(`${server.name} `)))
        await ipfs(node, 'pin', 'remote', 'service', 'add', server.name, server.url, token);
    return ipfs(node, 'pin', 'remote', 'add', `--service=${server.name}`, cid);
}

/** dpm tree <cid>, then ipfs pin remote add --service=<server> for each CID. */
async function pushTree(node: Kubo, server: Server, cid: string): Promise<void> {
    for (const c of await tree(cid, node)) await push(node, server, c);
}

/** What a user runs to fetch from a server: ipfs swarm peering add <the server node's addresses>. */
const peer = (node: Kubo, server: Server) => ipfs(node, 'swarm', 'peering', 'add', ...server.delegates);

/** A server's recorded decision on a CID, from its Pinning Service API. */
async function decision(server: Server, cid: string): Promise<PinStatus | undefined> {
    const [s] = await new PinningService(server.url).list({ cid: [cid], status: ['pinned', 'failed'] });
    return s;
}

/** Starts a DPM server in front of `kubo`, named `home`. */
async function homeServer(opts: Parameters<typeof startServer>[0]): Promise<Server & { idle(): Promise<void> }> {
    const { url, server } = await startServer(opts);
    return { name: 'home', url, delegates: server.delegates, idle: () => server.idle() };
}

const REFUSED = /remote service failed to pin/;

describe('dpm pack', () => {
    const MANIFEST_TEXT = '{\n    "deps": []\n}\n';

    it('writes the package without deps/ and hidden files, to a temporary folder named by a GUID', () => {
        const dir = project({ 'Kant/Ethics.ul': 'x', 'deps/something/file': 'installed', '.git/HEAD': 'ref' });
        const folder = pack(dir);
        try {
            expect(path.dirname(folder)).toBe(os.tmpdir());
            expect(path.basename(folder)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(readTree(folder)).toEqual({ 'Kant/Ethics.ul': 'x', 'dpm.json': MANIFEST_TEXT });
        } finally {
            fs.rmSync(folder, { recursive: true });
        }
    });

    it('writes to a folder of your choosing, but never over an existing one', () => {
        const dir = project({ 'Kant/Ethics.ul': 'x' });
        const out = path.join(tmpDir(), 'out', 'kant');
        expect(pack(dir, out)).toBe(out);
        expect(readTree(out)).toEqual({ 'Kant/Ethics.ul': 'x', 'dpm.json': MANIFEST_TEXT });
        expect(() => pack(dir, out)).toThrow(/already exists/);
    });

    it("refuses a folder without dpm.json: it isn't a DPM package", () => {
        const dir = tmpDir();
        writeTree(dir, { 'Kant/Ethics.ul': 'x' });
        expect(() => pack(dir)).toThrow(/is not a DPM project/);
    });
});

describe.skipIf(!IPFS_BIN)('DPM over IPFS (real Kubo nodes)', { timeout: 60_000 }, () => {
    if (!IPFS_BIN) it.skip('needs the ipfs binary: set IPFS_BIN or put Kubo on the PATH', () => undefined);

    describe('identity', () => {
        it('gives the same package the same CID on any node', async () => {
            const [a, b] = await Promise.all([startNode(), startNode()]);
            const dir = project({ 'Kant/Ethics.ul': 'duty : \\X. good X => ought X;\n' });
            const cid = await publish(dir, a);
            expect(await publish(dir, b)).toBe(cid);
            expect(cid).toMatch(/^bafy/);
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

    describe('push and install', () => {
        /** Three nodes: the author's, a server's, and a reader's that starts empty. */
        async function world() {
            const [author, serverNode, reader] = await Promise.all([startNode(), startNode(), startNode()]);
            const home = await homeServer({ kubo: serverNode });
            await peer(reader, home);
            return { author, serverNode, reader, home };
        }

        it('pushes with ipfs pin remote add: the server fetches from the author over IPFS', async () => {
            const { author, serverNode, home } = await world();
            const cid = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            expect(await push(author, home, cid)).toMatch(/Status: pinned/);
            expect(await serverNode.pins()).toContain(cid);
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
            const graph = await install(app, reader);
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
            await install(project({}, [alice]), reader);
            // Installed, and cached in the node, but not pinned.
            expect(await hasLocally(reader, alice)).toBe(true);
            expect(await reader.pins()).not.toContain(alice);
            expect(await reader.pins()).not.toContain(base);
            // ...the user runs their checks here, then pins Alice's package alone...
            await ipfs(reader, 'pin', 'add', alice);
            expect(await reader.pins()).toContain(alice);
            expect(await reader.pins()).not.toContain(base);
            // ...or its whole tree: dpm tree <cid> | ipfs pin add
            await ipfsWithInput(reader, (await tree(alice, reader)).join('\n') + '\n', 'pin', 'add');
            expect(await reader.pins()).toEqual(expect.arrayContaining([alice, base]));
        });

        it('removes packages no longer needed when reinstalling', async () => {
            const { author, home, reader } = await world();
            const base = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            const other = await publish(project({ 'Other/X.ul': 'x' }), author);
            await push(author, home, base);
            await push(author, home, other);
            const app = project({}, [base, other]);
            await install(app, reader);
            writeManifest(app, { deps: [base] });
            await install(app, reader);
            expect(fs.readdirSync(path.join(app, 'deps')).sort()).toEqual([base, 'graph.json'].sort());
        });

        it('fails, naming the package, when a dependency cannot be found anywhere', async () => {
            const author = await startNode();
            const missing = await unpublished(project({ 'Nowhere/X.ul': 'gone' }), author);
            const reader = new Kubo((await startNode()).api, '2s');
            await expect(install(project({}, [missing]), reader)).rejects.toThrow(`Could not fetch ${missing}`);
        });

        it('a server refuses a package whose tree cannot be completed', async () => {
            const { author, serverNode, home } = await world();
            const missing = await unpublished(project({ 'Nowhere/X.ul': 'gone' }), author);
            const present = await publish(project({ 'Kant/Ethics.ul': 'duty' }, [missing]), author);
            await expect(push(author, home, present)).rejects.toThrow(REFUSED);
            const s = await decision(home, present);
            expect(s?.status).toBe('failed');
            expect(s?.info?.reason).toContain(`Could not fetch ${missing}`);
            expect(await serverNode.pins()).not.toContain(present);
        }, 120_000);
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
            const readerAsAdmin = new KuboAdmin(node.api, '20s', 'bearer:read-only');
            await expect(readerAsAdmin.pin(app)).rejects.toThrow(/Access Denied/);
            await expect(readerAsAdmin.gc()).rejects.toThrow(/Access Denied/);
            await expect(new Kubo(node.api, '20s').version()).rejects.toThrow(/Access Denied/);
        });
    });

    describe('server policy', () => {
        it('keeps a package only if its check command succeeds, and says why it refused', async () => {
            const [author, serverNode] = await Promise.all([startNode(), startNode()]);
            // The check: every package must contain a README.
            const home = await homeServer({ kubo: serverNode, policy: commandPolicy('test -f README') });

            const good = await publish(project({ README: 'hi', 'Kant/Ethics.ul': 'duty' }), author);
            const bad = await publish(project({ 'Kant/Ethics.ul': 'duty' }), author);
            expect(await push(author, home, good)).toMatch(/Status: pinned/);
            await expect(push(author, home, bad)).rejects.toThrow(REFUSED);
            // The server records why; the ipfs command reports only that it refused.
            const refused = await decision(home, bad);
            expect(refused?.status).toBe('failed');
            expect(refused?.info?.reason).toMatch(/'test -f README' failed/);
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
            expect(await hasLocally(serverNode, cid)).toBe(false);
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
            expect(await hasLocally(serverNode, base)).toBe(false);
        });

        it("answers nothing of Kubo's RPC API, which stays private", async () => {
            const { url } = await startServer({ kubo: await startNode() });
            for (const command of ['pin/ls', 'id', 'version', 'pin/rm', 'pin/add', 'repo/gc', 'config', 'shutdown']) {
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
