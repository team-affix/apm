import { getAPIUrl, Remotes } from '../models/remotes';
import { createTrpcClient } from '../trpc/client';
import * as common from '@team-affix/apm-common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function log(...args: any[]) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(...args);
    }
}

export async function pull(remote: string, rootId: string) {
    // Get the remotes map
    const remotes = Remotes.getDefault();

    // Get the server url
    const serverUrl = remotes.get(remote);

    // Get the api url
    const apiUrl = getAPIUrl(serverUrl);

    // Create a TRPC client for the remote
    const trpcClient = createTrpcClient(apiUrl);

    // Get the pull dependencies
    const pullDependencies = await trpcClient.getPullDependencies.query({ rootId });

    // Get the default registry
    const registry = await common.Registry.getDefault();

    // Determine which pull dependencies are already present in the registry
    const presentDeps = await registry.ls(new Set<string>(pullDependencies.pkgIds));

    // Log the number of dependencies already present
    log('Dependencies already present: ', presentDeps.size);

    // Filter out the pull dependencies that are already present in the registry
    const missingDeps = pullDependencies.pkgIds.filter((pkgId) => !presentDeps.has(pkgId));

    // Log the number of dependencies missing
    log('Dependencies missing: ', missingDeps.length);

    // Create a temporary directory for the package
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-client-pull'));

    // Pull the missing dependencies
    for (const pkgId of missingDeps) {
        // Query the remote for the package
        const getResponse = await trpcClient.get.query({ id: pkgId });

        // Get the bytes
        const bytes = Buffer.from(getResponse.b64, 'base64');

        // Create the package file
        const pkgPath = path.join(tmpDir, `${pkgId}.apm`);
        fs.writeFileSync(pkgPath, bytes);

        // Load the package
        const pkg = await common.Package.load(pkgPath);

        // Register the package
        await registry.put(pkg, pkgId);

        // Log the package that was pulled
        log('Pulled: ', pkgId);
    }
}
