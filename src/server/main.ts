#!/usr/bin/env node
import os from 'os';
import path from 'path';
import { Kubo } from '../core';
import { VERSION } from '../version';
import { commandPolicy, createServer } from './server';

/**
 * The reference DPM server, configured by environment variables:
 *
 *   PORT, HOST       where to listen (default 3000, all interfaces)
 *   DPM_KUBO_API     the Kubo node's RPC API (default http://127.0.0.1:5001; keep it private)
 *   DPM_DATA         where pin requests are stored (default ~/.dpm/server)
 *   DPM_TOKENS       comma-separated access tokens; if set, adding or removing pins needs one
 *   DPM_ANNOUNCE     comma-separated multiaddrs clients should connect to (default: the node's own)
 *   DPM_CHECK        a command to run in each installed package; it is kept only if the command succeeds
 *                    (a Unilog server uses DPM_CHECK="unilog check")
 *   DPM_KEEP_DEPS    1: keep each package's dependencies too, not only what was pushed
 */
const list = (v?: string) =>
    v
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);

async function main() {
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST;
    const kubo = new Kubo(process.env.DPM_KUBO_API);
    const ipfs = await kubo.version();
    const tokens = list(process.env.DPM_TOKENS);
    const announce = list(process.env.DPM_ANNOUNCE);
    const server = await createServer({
        kubo,
        dataDir: process.env.DPM_DATA ?? path.join(os.homedir(), '.dpm', 'server'),
        ...(tokens && { tokens }),
        ...(announce && { delegates: announce }),
        ...(process.env.DPM_CHECK && { policy: commandPolicy(process.env.DPM_CHECK) }),
        keepDependencies: process.env.DPM_KEEP_DEPS === '1',
    });
    server.http.listen(port, host, () => {
        console.log(`dpm-server ${VERSION} listening on ${host ?? '*'}:${port}, using Kubo ${ipfs} at ${kubo.api}`);
        if (process.env.DPM_CHECK) console.log(`policy: keep packages for which '${process.env.DPM_CHECK}' succeeds`);
        if (!tokens) console.log('anyone may add pins (set DPM_TOKENS to require a token)');
        console.log(
            process.env.DPM_KEEP_DEPS === '1'
                ? "keeping packages' dependencies too"
                : 'keeping only what was pushed (DPM_KEEP_DEPS=1 keeps dependencies too)',
        );
    });
}

main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exitCode = 1;
});
