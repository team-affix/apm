import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { Registry } from '@team-affix/apm-common';

// Initialize tRPC
const t = initTRPC.create();

// LS Input Type
const LSInputType = z.object({
  ids: z.array(z.string())
});

// LS Output Type
const LSOutputType = z.object({
  ids: z.array(z.string())
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
        ids: Array.from(result)
      };
    })
});

// Export the router type for client-side usage
export type AppRouter = typeof appRouter; 