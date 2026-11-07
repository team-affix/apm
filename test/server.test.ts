import http from 'http';
import { AddressInfo } from 'net';
import { describe, expect, it, onTestFinished } from 'vitest';
import { Package, RemoteError } from '../src/core';
import { pkg } from './helpers';
import { startServer } from './server-helpers';

async function post(url: string, body: unknown) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('server', () => {
    it('reports health', async () => {
        const { remote } = await startServer();
        await expect(remote.health()).resolves.toBeUndefined();
    });

    it('accepts a pushed package and serves it back byte-for-byte', async () => {
        const { remote, registry } = await startServer();
        const a = pkg('A', [], 'content');
        expect(await remote.push([a])).toEqual({ ids: [a.id], stored: [a.id] });
        expect((await remote.get(a.id))?.bytes.equals(a.bytes)).toBe(true);
        expect(await registry.list()).toEqual([a.id]);
        expect(await remote.list()).toEqual([a.id]);
    });

    it('answers has() with the subset present', async () => {
        const { remote } = await startServer();
        const a = pkg('A');
        await remote.push([a]);
        expect(await remote.has([a.id, pkg('B').id])).toEqual(new Set([a.id]));
        expect(await remote.has([])).toEqual(new Set());
    });

    it('returns undefined for a package it does not have', async () => {
        const { remote } = await startServer();
        expect(await remote.get(pkg('Nope').id)).toBeUndefined();
    });

    it('treats a re-push as a no-op', async () => {
        const { remote } = await startServer();
        const a = pkg('A');
        await remote.push([a]);
        expect(await remote.push([a])).toEqual({ ids: [a.id], stored: [] });
    });

    it('accepts a batch containing its own dependencies', async () => {
        const { remote } = await startServer();
        const a = pkg('A');
        const b = pkg('B', [a]);
        expect((await remote.push([b, a])).stored).toEqual([a.id, b.id]);
    });

    it('rejects a package whose dependencies cannot be found (422) and stores nothing', async () => {
        const { remote, registry } = await startServer();
        const b = pkg('B', [pkg('Missing')]);
        const err = await remote.push([b]).catch((e) => e);
        expect(err).toBeInstanceOf(RemoteError);
        expect((err as RemoteError).status).toBe(422);
        expect(err.message).toMatch(/No provider found/);
        expect(await registry.list()).toEqual([]);
    });

    it('fetches missing dependencies from provider registries without storing them', async () => {
        const provider = await startServer();
        const target = await startServer();
        const a = pkg('A');
        await provider.remote.push([a]);
        const b = pkg('B', [a]);
        expect((await target.remote.push([b], [provider.url])).stored).toEqual([b.id]);
        expect(await target.registry.list()).toEqual([b.id]);
    });

    it('tries providers in order, skipping unreachable ones', async () => {
        const provider = await startServer();
        const target = await startServer();
        const a = pkg('A');
        await provider.remote.push([a]);
        const b = pkg('B', [a]);
        await expect(target.remote.push([b], ['http://127.0.0.1:1', provider.url])).resolves.toBeDefined();
    });

    it('can be configured to refuse provider lookups', async () => {
        const { remote } = await startServer({ allowProviders: false });
        await expect(remote.push([pkg('A')], ['http://127.0.0.1:1'])).rejects.toMatchObject({ status: 400 });
    });

    it('rejects too many providers and non-http provider URLs', async () => {
        const { remote } = await startServer({ maxProviders: 1 });
        await expect(remote.push([pkg('A')], ['http://a', 'http://b'])).rejects.toMatchObject({ status: 400 });
        await expect(remote.push([pkg('A')], ['file:///etc/passwd'])).rejects.toMatchObject({ status: 400 });
    });

    it('runs a configured verifier and rejects with 422', async () => {
        const { remote, registry } = await startServer({
            verify: (p: Package) => {
                if (p.payload.toString().includes('contradiction')) throw new Error('derives ⊥');
            },
        });
        await remote.push([pkg('Good', [], 'fine')]);
        const err = await remote.push([pkg('Bad', [], 'a contradiction')]).catch((e) => e);
        expect(err).toMatchObject({ status: 422 });
        expect(err.message).toMatch(/derives ⊥/);
        expect((await registry.list()).map((id) => id.split('@')[0])).toEqual(['Good']);
    });

    describe('rejects malformed requests with 400', () => {
        it.each([
            ['invalid JSON', '{'],
            ['a non-object body', '[]'],
            ['packages not an array', { packages: 'x' }],
            ['a bare base64 string instead of { id, data }', { packages: [pkg('A').bytes.toString('base64')] }],
            [
                'bytes that are not a package',
                { packages: [{ id: pkg('A').id, data: Buffer.from('junk').toString('base64') }] },
            ],
            ['non-string providers', { packages: [], providers: [1] }],
        ])('%s', async (_, body) => {
            const { url } = await startServer();
            const res = await post(`${url}/packages`, body);
            expect(res.status).toBe(400);
            expect(typeof res.body.error).toBe('string');
        });

        it('an invalid ID in a GET', async () => {
            const { url } = await startServer();
            expect((await fetch(`${url}/packages/not-an-id`)).status).toBe(400);
        });
    });

    describe('hash verification (first check, before resolution)', () => {
        const entry = (id: string, p: Package) => ({ id, data: p.bytes.toString('base64') });

        it('rejects a package whose bytes do not hash to its claimed ID, storing nothing', async () => {
            const { url, registry } = await startServer();
            const real = pkg('A', [], 'real');
            const swapped = pkg('A', [], 'swapped');
            const ok = pkg('Ok');
            const res = await post(`${url}/packages`, { packages: [entry(ok.id, ok), entry(real.id, swapped)] });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/hash check failed/);
            expect(await registry.list()).toEqual([]);
        });

        it('fails the hash check before trying to resolve or contacting providers', async () => {
            let providerHits = 0;
            const spy = http.createServer((_req, res) => {
                providerHits++;
                res.writeHead(404).end();
            });
            await new Promise<void>((r) => spy.listen(0, '127.0.0.1', r));
            onTestFinished(() => new Promise<void>((r) => spy.close(() => r())));
            const spyUrl = `http://127.0.0.1:${(spy.address() as AddressInfo).port}`;

            const { url } = await startServer();
            const needsDeps = pkg('B', [pkg('Missing')]); // would fail resolution (422) if it got that far
            const res = await post(`${url}/packages`, {
                packages: [entry(needsDeps.id, pkg('B', [pkg('Missing')], 'different'))],
                providers: [spyUrl],
            });
            expect(res.status).toBe(400);
            expect(providerHits).toBe(0);

            // Sanity check: with the right bytes it does get as far as resolution and asks the provider.
            const res2 = await post(`${url}/packages`, {
                packages: [entry(needsDeps.id, needsDeps)],
                providers: [spyUrl],
            });
            expect(res2.status).toBe(422);
            expect(providerHits).toBeGreaterThan(0);
        });
    });

    it('enforces the body size limit (413)', async () => {
        const { url } = await startServer({ maxBodyBytes: 100 });
        const big = pkg('A', [], 'x'.repeat(500));
        const res = await post(`${url}/packages`, {
            packages: [{ id: big.id, data: big.bytes.toString('base64') }],
        });
        expect(res.status).toBe(413);
    });

    it('returns 404 for unknown routes', async () => {
        const { url } = await startServer();
        expect((await fetch(`${url}/nope`)).status).toBe(404);
    });
});
