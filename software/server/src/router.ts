import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { Package } from '@team-affix/apm-common';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getRegistry } from './models/registry';

// Initialize tRPC
const t = initTRPC.create();

// Get Pull Dependencies Input Type
const GetPullDependenciesInputType = z.object({
    rootId: z.string(),
});

// Get Pull Dependencies Output Type
const GetPullDependenciesOutputType = z.object({
    pkgIds: z.array(z.string()),
});

// Get Input Type
const GetInputType = z.object({
    id: z.string(),
});

// Get Output Type
const GetOutputType = z.object({
    b64: z.string(),
});

// LS Input Type
const LSInputType = z.object({
    ids: z.array(z.string()),
});

// LS Output Type
const LSOutputType = z.object({
    ids: z.array(z.string()),
});

// Put Input Type
const PutInputType = z.object({
    id: z.string(),
    b64: z.string(),
});

// Put Output Type
const PutOutputType = z.object({
    id: z.string(),
});

// Create router
export const appRouter = t.router({
    getPullDependencies: t.procedure
        .input(GetPullDependenciesInputType)
        .output(GetPullDependenciesOutputType)
        .query(async ({ input }) => {
            // Get the default registry
            const registry = await getRegistry();

            // Get the package tree
            const result = await registry.getPackageTree(input.rootId);

            // Get the topological sort
            const topologicalSort = result.getTopologicalSort();

            // Get the package ids
            const pkgIds = topologicalSort.map((pkg) => pkg.id);

            return {
                pkgIds,
            };
        }),

    get: t.procedure
        .input(GetInputType)
        .output(GetOutputType)
        .query(async ({ input }) => {
            // Get the default registry
            const registry = await getRegistry();

            // Get the package
            const result = await registry.get(input.id);

            // Get the package bytes from the file
            const bytes = fs.readFileSync(result.filePath);

            return {
                b64: bytes.toString('base64'),
            };
        }),

    ls: t.procedure
        .input(LSInputType)
        .output(LSOutputType)
        .query(async ({ input }) => {
            // Get the default registry
            const registry = await getRegistry();

            // ls the registry
            const result = await registry.ls(new Set(input.ids));

            return {
                ids: Array.from(result),
            };
        }),

    put: t.procedure
        .input(PutInputType)
        .output(PutOutputType)
        .mutation(async ({ input }) => {
            // Get the default registry
            const registry = await getRegistry();

            // Get the package bytes from the base64 string
            const bytes = Buffer.from(input.b64, 'base64');

            // Create a temporary file
            const tempFilePath = path.join(os.tmpdir(), `${input.id}.apm`);
            fs.writeFileSync(tempFilePath, bytes);

            // Load the package from file
            const pkg = await Package.load(tempFilePath);

            // Put the package
            await registry.put(pkg, input.id);

            // Delete the temporary file
            fs.rmSync(tempFilePath, { force: true, recursive: true });

            return {
                id: input.id,
            };
        }),
});

// Export the router type for client-side usage
export type AppRouter = typeof appRouter;
