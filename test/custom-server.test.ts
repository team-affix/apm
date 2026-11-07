import http from 'http';
import { AddressInfo } from 'net';
import { describe, expect, it, onTestFinished } from 'vitest';
import { Package, Registry, RejectedError, RemoteRegistry, resolve, Resolution } from '../src/core';
import { pull, push } from '../src/client';
import {
    handle,
    HttpError,
    matchRoute,
    parseHasRequest,
    parsePushRequest,
    readJson,
    sendJson,
    sendPackage,
} from '../src/server';
import { pkg, tmpDir } from './helpers';
import { startServer } from './server-helpers';

/**
 * A server with its own acceptance policy, written the way DLPM would write one: its own handler,
 * assembled from DPM's protocol parts, with no hook into the reference server.
 *
 * Policy: like the reference server, but it also checks the whole batch at once and rejects any
 * package whose resolved tree contains "contradiction".
 */
function createStrictServer(registry: Registry, checked: string[][]): http.Server {
    async function checkBatch(packages: Package[], resolutions: Resolution[]) {
        checked.push(packages.map((p) => p.name));
        packages.forEach((p, i) => {
            const tree = [p, ...(resolutions[i]?.packages ?? [])];
            if (tree.some((t) => t.payload.toString().includes('contradiction')))
                throw new RejectedError(p.id, 'derives ⊥');
        });
    }

    return http.createServer(
        handle(async (req, res) => {
            const route = matchRoute(req);
            switch (route?.kind) {
                case 'health':
                    return sendJson(res, 200, { status: 'ok' });
                case 'list':
                    return sendJson(res, 200, { ids: await registry.list() });
                case 'has':
                    return sendJson(res, 200, {
                        ids: [...(await registry.has(parseHasRequest(await readJson(req, 1e6))))],
                    });
                case 'get': {
                    const found = await registry.get(route.id);
                    if (!found) throw new HttpError(404, 'not found');
                    return sendPackage(res, found);
                }
                case 'push': {
                    // 1. hash check (inside parsePushRequest)
                    const { packages, providers } = parsePushRequest(await readJson(req, 1e6));
                    // 2. resolve, with this server's own choice of sources
                    const sources = [registry, ...providers.map((u) => new RemoteRegistry(u))];
                    const batch = {
                        label: 'batch',
                        get: async (id: string) => packages.find((p) => p.id === id),
                        has: async () => new Set<string>(),
                    };
                    const resolutions = await Promise.all(packages.map((p) => resolve(p, [batch, ...sources])));
                    // 3. this server's own policy, on the whole batch at once
                    await checkBatch(packages, resolutions);
                    // 4. store
                    for (const p of packages) await registry.put(p);
                    return sendJson(res, 200, { ids: packages.map((p) => p.id), stored: packages.map((p) => p.id) });
                }
                default:
                    throw new HttpError(404, 'no route');
            }
        }),
    );
}

async function startStrict() {
    const registry = Registry.openOrCreate(tmpDir());
    const checked: string[][] = [];
    const server = createStrictServer(registry, checked);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    onTestFinished(() => new Promise<void>((r) => server.close(() => r())));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { url, registry, remote: new RemoteRegistry(url), checked };
}

describe('a custom-policy server built from protocol parts', () => {
    it('speaks the same protocol: the standard client pushes to and pulls from it', async () => {
        const strict = await startStrict();
        const client = Registry.openOrCreate(tmpDir());
        const a = pkg('A', [], 'axiom');
        const b = pkg('B', [a], 'theorem');
        await client.put(a);
        await client.put(b);

        expect((await push(client, b.id, strict.remote)).stored.sort()).toEqual([a.id, b.id].sort());
        expect(strict.checked).toEqual([['A', 'B']]); // one check for the whole batch

        const other = Registry.openOrCreate(tmpDir());
        await pull(other, b.id, [strict.remote]);
        expect(await other.list()).toEqual([a.id, b.id].sort());
    });

    it('applies its own policy, rejecting with the protocol status (422)', async () => {
        const strict = await startStrict();
        const bad = pkg('Bad', [], 'a contradiction');
        const err = await strict.remote.push([bad]).catch((e) => e);
        expect(err).toMatchObject({ status: 422 });
        expect(err.message).toMatch(/derives ⊥/);
        expect(await strict.registry.list()).toEqual([]);
    });

    it('still gets the protocol-mandated hash check for free', async () => {
        const strict = await startStrict();
        const real = pkg('A', [], 'real');
        const res = await fetch(`${strict.url}/packages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ packages: [{ id: real.id, data: pkg('A', [], 'fake').bytes.toString('base64') }] }),
        });
        expect(res.status).toBe(400);
        expect(strict.checked).toEqual([]);
    });

    it('interoperates with a reference server: the same package can live on both', async () => {
        const strict = await startStrict();
        const plain = await startServer();
        const contradiction = pkg('Heresy', [], 'a contradiction');
        await plain.remote.push([contradiction]); // the reference server has no logic policy
        await expect(strict.remote.push([contradiction])).rejects.toMatchObject({ status: 422 });
        expect(await plain.registry.list()).toEqual([contradiction.id]);
    });
});
