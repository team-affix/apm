import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { Registry } from '@team-affix/apm-common';
import fs from 'fs';

// Initialize tRPC
const t = initTRPC.create();

// LS Input Type
const LSInputType = z.object({
    ids: z.array(z.string()),
});

// LS Output Type
const LSOutputType = z.object({
    ids: z.array(z.string()),
});

// Get Input Type
const GetInputType = z.object({
    id: z.string(),
});

// Get Output Type
const GetOutputType = z.object({
    b64: z.string(),
});

// Get Pull Dependencies Input Type
const GetPullDependenciesInputType = z.object({
    rootId: z.string(),
});

// Get Pull Dependencies Output Type
const GetPullDependenciesOutputType = z.object({
    pkgIds: z.array(z.string()),
});

// Create router
export const appRouter = t.router({
    ls: t.procedure
        .input(LSInputType)
        .output(LSOutputType)
        .query(async ({ input }) => {
            // Get the default registry
            const registry = await Registry.getDefault();

            // ls the registry
            const result = await registry.ls(new Set(input.ids));

            return {
                ids: Array.from(result),
            };
        }),

    get: t.procedure
        .input(GetInputType)
        .output(GetOutputType)
        .query(async ({ input }) => {
            // Get the default registry
            const registry = await Registry.getDefault();

            // Get the package
            const result = await registry.get(input.id);

            // Get the package bytes from the file
            const bytes = fs.readFileSync(result.filePath);

            return {
                b64: bytes.toString('base64'),
            };
        }),

    getPullDependencies: t.procedure
        .input(GetPullDependenciesInputType)
        .output(GetPullDependenciesOutputType)
        .query(async ({ input }) => {
            // Get the default registry
            const registry = await Registry.getDefault();

            // Get the package tree
            const result = await registry.getPackageTree(input.rootId);

            // Get the topological sort
            const topologicalSort = result.getTopologicalSort();

            // Get the package ids
            const pkgIds = topologicalSort.map((pkg) => pkg.id);

            // Filter out duplicate package ids (PRESERVE ORDER)
            const seen = new Set<string>();
            const uniquePkgIds = [];
            for (const pkgId of pkgIds) {
                if (!seen.has(pkgId)) {
                    seen.add(pkgId);
                    uniquePkgIds.push(pkgId);
                }
            }

            return {
                pkgIds: uniquePkgIds,
            };
        }),
});

// Export the router type for client-side usage
export type AppRouter = typeof appRouter;
