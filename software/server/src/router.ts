import { initTRPC } from '@trpc/server';
import { z } from 'zod';

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
      // Simple ls implementation - returns the same ids array
      return {
        ids: input.ids
      };
    })
});

// Export the router type for client-side usage
export type AppRouter = typeof appRouter; 