import { ChildProcess, execFileSync, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { afterAll, afterEach } from 'vitest';
import { Kubo } from '../src/core';
import { createServer, DpmServer, ServerOptions } from '../src/server';

const created: string[] = [];

/** A fresh temporary directory, removed after the current test. */
export function tmpDir(prefix = 'dpm-test-'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    created.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes `files` (relative path -> content) under `dir`. */
export function writeTree(dir: string, files: Record<string, string>): void {
    for (const [rel, content] of Object.entries(files)) {
        const file = path.join(dir, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
}

/** Reads every file under `dir` into a relative path -> content map. */
export function readTree(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (rel: string) => {
        for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(r);
            else out[r] = fs.readFileSync(path.join(dir, r), 'utf8');
        }
    };
    walk('');
    return out;
}

// --- Real IPFS nodes (Kubo), for end-to-end tests ---

/** The Kubo binary: $IPFS_BIN, or `ipfs` on the PATH. Tests that need it are skipped without it. */
export const IPFS_BIN = (() => {
    const bin = process.env.IPFS_BIN ?? 'ipfs';
    try {
        execFileSync(bin, ['version'], { stdio: 'ignore' });
        return bin;
    } catch {
        if (process.env.DPM_REQUIRE_IPFS)
            throw new Error(`DPM_REQUIRE_IPFS is set, but there is no working ipfs binary ('${bin}')`);
        return undefined;
    }
})();

const daemons: ChildProcess[] = [];
const servers: DpmServer[] = [];
afterAll(async () => {
    for (const s of servers.splice(0)) await new Promise((r) => s.http.close(r));
    for (const d of daemons.splice(0)) d.kill('SIGKILL');
});

/**
 * Starts a Kubo node in a fresh repo, isolated from the public network: local addresses only, no bootstrap
 * peers, no discovery. Nodes only meet when DPM connects them, as it would across the internet.
 */
export async function startNode(): Promise<Kubo> {
    if (!IPFS_BIN) throw new Error('no ipfs binary');
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dpm-kubo-'));
    const env = { ...process.env, IPFS_PATH: repo };
    execFileSync(IPFS_BIN, ['init', '--profile=test,unixfs-v1-2025'], { env, stdio: 'ignore' });
    const daemon = spawn(IPFS_BIN, ['daemon'], { env, stdio: 'ignore' });
    daemons.push(daemon);
    const apiFile = path.join(repo, 'api');
    for (let i = 0; i < 100 && !fs.existsSync(apiFile); i++) await new Promise((r) => setTimeout(r, 100));
    const m = /\/ip4\/([^/]+)\/tcp\/(\d+)/.exec(fs.readFileSync(apiFile, 'utf8'));
    if (!m) throw new Error('Kubo did not report its API address');
    const kubo = new Kubo(`http://${m[1]}:${m[2]}`, '20s');
    for (let i = 0; i < 100; i++) {
        try {
            await kubo.version();
            return kubo;
        } catch {
            await new Promise((r) => setTimeout(r, 100));
        }
    }
    throw new Error('Kubo did not start');
}

/** Starts a DPM server on a free port, in front of `kubo`. */
export async function startServer(opts: Omit<ServerOptions, 'dataDir'> & { dataDir?: string }) {
    const dataDir = opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'dpm-server-'));
    const server: DpmServer = await createServer({ ...opts, dataDir });
    await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', () => r()));
    servers.push(server);
    const { port } = server.http.address() as net.AddressInfo;
    return { server, url: `http://127.0.0.1:${port}` };
}
