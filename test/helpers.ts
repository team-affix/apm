import { ChildProcess, execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach } from 'vitest';
import { Kubo } from '../src/core';

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

/**
 * A test's view of a node: the read-only `Kubo` client dpm uses, plus what tests need to set nodes up and look at
 * them (dpm itself never does any of this; users do it with the ipfs command).
 */
export class TestNode extends Kubo {
    async id(): Promise<{ id: string; addresses: string[] }> {
        const r = await this.json<{ ID: string; Addresses: string[] | null }>('id');
        return { id: r.ID, addresses: r.Addresses ?? [] };
    }

    async pins(): Promise<string[]> {
        const r = await this.json<{ Keys?: Record<string, unknown> }>('pin/ls', { type: 'recursive' });
        return Object.keys(r.Keys ?? {});
    }

    async pin(cid: string): Promise<void> {
        await this.call('pin/add', { arg: cid, recursive: 'true' });
    }

    async gc(): Promise<void> {
        await this.call('repo/gc', { silent: 'true' });
    }

    async connect(multiaddr: string): Promise<void> {
        await this.call('swarm/connect', { arg: multiaddr });
    }
}

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
afterAll(async () => {
    for (const d of daemons.splice(0)) d.kill('SIGKILL');
});

/**
 * Starts a Kubo node in a fresh repo, isolated from the public network: local addresses only, no bootstrap
 * peers, no discovery. Nodes only meet when DPM connects them, as it would across the internet.
 */
export async function startNode(
    opts: {
        /** Kubo's init profiles (default: the test profile, plus unixfs-v1-2025 for plain `ipfs add`). */
        profile?: string;
        /** Kubo's API.Authorizations: if set, every API request needs one of these secrets. */
        authorizations?: Record<string, { AuthSecret: string; AllowedPaths: string[] }>;
        /** The secret the returned client uses. */
        auth?: string;
    } = {},
): Promise<TestNode> {
    if (!IPFS_BIN) throw new Error('no ipfs binary');
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dpm-kubo-'));
    const env = { ...process.env, IPFS_PATH: repo };
    execFileSync(IPFS_BIN, ['init', `--profile=${opts.profile ?? 'test,unixfs-v1-2025'}`], { env, stdio: 'ignore' });
    if (opts.authorizations)
        execFileSync(IPFS_BIN, ['config', '--json', 'API.Authorizations', JSON.stringify(opts.authorizations)], {
            env,
            stdio: 'ignore',
        });
    const daemon = spawn(IPFS_BIN, ['daemon'], { env, stdio: 'ignore' });
    daemons.push(daemon);
    const apiFile = path.join(repo, 'api');
    for (let i = 0; i < 100 && !fs.existsSync(apiFile); i++) await new Promise((r) => setTimeout(r, 100));
    const m = /\/ip4\/([^/]+)\/tcp\/(\d+)/.exec(fs.readFileSync(apiFile, 'utf8'));
    if (!m) throw new Error('Kubo did not report its API address');
    const kubo = new TestNode(`http://${m[1]}:${m[2]}`, '20s', opts.auth);
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

/** Whether a node holds a path, without fetching anything from the network. */
export async function hasLocally(kubo: Kubo, ipfsPath: string): Promise<boolean> {
    const url = new URL('/api/v0/files/stat', kubo.api);
    url.searchParams.set('arg', `/ipfs/${ipfsPath}`);
    url.searchParams.set('offline', 'true');
    return (await fetch(url, { method: 'POST' })).ok;
}
