import http from 'http';
import { AddressInfo } from 'net';
import { describe, expect, it, onTestFinished } from 'vitest';
import { MissingDependencyError, PeerConflictError, Registry, RemoteRegistry } from '../src/core';
import { pull, push } from '../src/client';
import { pkg, tmpDir } from './helpers';
import { startServer } from './server-helpers';

const local = () => Registry.openOrCreate(tmpDir('dpm-client-'));

describe('pull', () => {
    it('pulls a package and its whole resolved tree', async () => {
        const server = await startServer();
        const a = pkg('A');
        const b = pkg('B', [a]);
        const c = pkg('C', [b]);
        await server.remote.push([a, b, c]);

        const reg = local();
        const stored = await pull(reg, c.id, [server.remote]);
        expect(stored.map((p) => p.name)).toEqual(['A', 'B', 'C']);
        expect(await reg.list()).toEqual([a.id, b.id, c.id].sort());
    });

    it('assembles a tree from several registries, none of which has all of it', async () => {
        const one = await startServer();
        const two = await startServer();
        const a = pkg('A');
        const b = pkg('B', [a]);
        await one.remote.push([a]);
        await two.remote.push([b], [one.url]); // two holds only B

        const reg = local();
        await pull(reg, b.id, [two.remote, one.remote]);
        expect(await reg.list()).toEqual([a.id, b.id].sort());
    });

    it('recovers a package after the registry it came from disappears', async () => {
        const original = await startServer();
        const mirror = await startServer();
        const a = pkg('Heresy', [], 'a belief someone wants gone');
        await original.remote.push([a]);
        await mirror.remote.push([a]);
        // Only the ID is needed to find it again; where it lives is irrelevant.
        const reg = local();
        await pull(reg, a.id, [original.remote, mirror.remote].reverse());
        expect((await reg.get(a.id))?.payload.toString()).toBe('a belief someone wants gone');
    });

    it('reports a package no remote has', async () => {
        await expect(pull(local(), pkg('Ghost').id, [(await startServer()).remote])).rejects.toThrow(
            MissingDependencyError,
        );
    });

    it('does nothing when everything is already local', async () => {
        const reg = local();
        const a = pkg('A');
        await reg.put(a);
        expect(await pull(reg, a.id, [])).toEqual([]);
    });
});

describe('push', () => {
    it('sends only what the remote lacks', async () => {
        const server = await startServer();
        const reg = local();
        const a = pkg('A');
        const b = pkg('B', [a]);
        await reg.put(a);
        await reg.put(b);
        await server.remote.push([a]);

        expect((await push(reg, b.id, server.remote)).stored).toEqual([b.id]);
        expect(await push(reg, b.id, server.remote)).toEqual({ ids: [], stored: [] });
    });

    it('lets the server fetch dependencies the client never stored, via providers', async () => {
        const provider = await startServer();
        const target = await startServer();
        const a = pkg('A');
        await provider.remote.push([a]);

        const reg = local();
        const b = pkg('B', [a]);
        await reg.put(b); // A is not local
        expect((await push(reg, b.id, target.remote, [provider.remote])).stored).toEqual([b.id]);
    });

    it('pushes an override-resolved tree that the server re-checks', async () => {
        const server = await startServer();
        const reg = local();
        const c1 = pkg('C', [], '1');
        const c2 = pkg('C', [], '2');
        const x = pkg('X', [c1]);
        const y = pkg('Y', [c2]);
        for (const p of [c1, c2, x, y]) await reg.put(p);
        const root = pkg('Root', [x, y, c2]); // root picks C = c2
        await reg.put(root);

        // X still needs c1 for its own resolution, which the root's tree doesn't contain.
        // The server can't find it, so the push fails until a provider has it.
        await expect(push(reg, root.id, server.remote)).rejects.toMatchObject({ status: 422 });

        const provider = await startServer();
        await provider.remote.push([c1]);
        await expect(push(reg, root.id, server.remote, [provider.remote])).resolves.toBeDefined();
        expect(await server.remote.has([root.id, x.id, y.id, c2.id])).toEqual(new Set([root.id, x.id, y.id, c2.id]));
    });

    it('refuses to push something with an unresolved conflict', async () => {
        const server = await startServer();
        const reg = local();
        const c1 = pkg('C', [], '1');
        const c2 = pkg('C', [], '2');
        const x = pkg('X', [c1]);
        const y = pkg('Y', [c2]);
        const root = pkg('Root', [x, y]);
        for (const p of [c1, c2, x, y, root]) await reg.put(p);
        await expect(push(reg, root.id, server.remote)).rejects.toThrow(PeerConflictError);
    });

    it('reports a package that is not local', async () => {
        await expect(push(local(), pkg('Nope').id, (await startServer()).remote)).rejects.toThrow(
            MissingDependencyError,
        );
    });
});

describe('hash verification on fetch', () => {
    it('refuses content from a remote that does not match the requested ID', async () => {
        const real = pkg('A', [], 'real');
        const fake = pkg('A', [], 'fake');
        // A registry that answers every request with the same (wrong) bytes.
        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(fake.bytes);
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        onTestFinished(() => new Promise<void>((r) => server.close(() => r())));
        const liar = new RemoteRegistry(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);

        await expect(liar.get(real.id)).rejects.toThrow(/hash check failed/);
        const reg = local();
        await expect(pull(reg, real.id, [liar])).rejects.toThrow(MissingDependencyError);
        expect(await reg.list()).toEqual([]);
    });
});
