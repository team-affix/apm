import { createTrpcClient } from '../trpc/client';
import * as common from '@team-affix/apm-common';
import * as fs from 'fs';

export function log(...args: unknown[]) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(...args);
    }
}

export async function push(apiUrl: string, rootId: string): Promise<void> {
    // Get the default registry
    const registry = await common.Registry.getDefault();

    // Get the package tree
    const tree = await registry.getPackageTree(rootId);

    // Get the list of packages to push
    const pushDependencies = tree.getTopologicalSort();

    // Get the trpc client
    const trpcClient = createTrpcClient(apiUrl);

    // LS the remote given the topological sort
    const remotePkgs = await trpcClient.ls.query({ ids: pushDependencies.map((pkg) => pkg.id) });

    // Get the set of remote package ids
    const presentDeps = new Set(remotePkgs.ids);

    // Log the number of dependencies already present
    log('Dependencies already present: ', presentDeps.size);

    // Get a list of missing package ids (PRESERVE ORDER)
    const missingDeps = pushDependencies.filter((pkg) => !presentDeps.has(pkg.id));

    // Log the number of dependencies missing
    log('Dependencies missing: ', missingDeps.length);

    for (const pkg of missingDeps) {
        // Get the bytes
        const bytes = fs.readFileSync(pkg.filePath);

        // Convert to base64
        const b64 = bytes.toString('base64');

        // Put the package
        await trpcClient.put.mutate({ id: pkg.id, b64 });

        // Log the package that was pushed
        log('Pushed: ', pkg.id);
    }
}
