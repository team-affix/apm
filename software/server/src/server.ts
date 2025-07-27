import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router';

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for client connections
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Mount tRPC middleware at /api/trpc
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: () => ({}), // Empty context for now
  })
);

// Start server
app.listen(port, () => {
  console.log(`🚀 tRPC server running on http://localhost:${port}`);
  console.log(`📡 tRPC endpoint: http://localhost:${port}/api/trpc`);
  console.log(`❤️  Health check: http://localhost:${port}/health`);
});

export { app }; 