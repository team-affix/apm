import { Remotes } from '../models/remotes';
import { createTrpcClient } from '../trpc/client';
import * as common from '@team-affix/apm-common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function pull(remote: string, rootId: string) {
    // Get the remotes map
    const remotes = Remotes.getDefault();

    // Get the remote url
    const url = remotes.get(remote);

    // Create a TRPC client for the remote
    const trpcClient = createTrpcClient(url);

    // Get the pull dependencies
    const pullDependencies = await trpcClient.getPullDependencies.query({ rootId });

    // Get the default registry
    const registry = await common.Registry.getDefault();

    // Determine which pull dependencies are already present in the registry
    const presentDeps = await registry.ls(new Set<string>(pullDependencies.pkgIds));

    // Filter out the pull dependencies that are already present in the registry
    const missingDeps = pullDependencies.pkgIds.filter((pkgId) => !presentDeps.has(pkgId));

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
    }
}
