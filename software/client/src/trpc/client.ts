import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
// Import ONLY the type from the published npm package (no runtime code)
import type { AppRouter } from '@team-affix/apm-server';

export function createTrpcClient(apiUrl: string) {
    // Create the tRPC client with full type safety
    return createTRPCProxyClient<AppRouter>({
        links: [
            httpBatchLink({
                url: apiUrl,
                // Optional: Add headers, auth, etc.
                headers() {
                    return {
                        // Authorization: `Bearer ${getAuthToken()}`,
                    };
                },
            }),
        ],
    });
}
