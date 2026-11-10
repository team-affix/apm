import { AddressInfo } from 'net';
import { afterEach } from 'vitest';
import { Registry, RemoteRegistry } from '../src/core';
import { createServer, ServerOptions } from '../src/server';
import { tmpDir } from './helpers';

const running: (() => Promise<void>)[] = [];

afterEach(async () => {
    await Promise.all(running.splice(0).map((stop) => stop()));
});

export interface TestServer {
    url: string;
    registry: Registry;
    remote: RemoteRegistry;
}

/** Starts a real DPM server on a random local port with a fresh registry. Stopped after the test. */
export async function startServer(options: Partial<ServerOptions> = {}): Promise<TestServer> {
    const registry = options.registry ?? Registry.openOrCreate(tmpDir('dpm-server-'));
    const server = createServer({ ...options, registry });
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    running.push(() => new Promise<void>((res) => server.close(() => res())));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { url, registry, remote: new RemoteRegistry(url) };
}
