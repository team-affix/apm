import { appRouter } from '../src/router';

// Create a caller to test the router directly
const caller = appRouter.createCaller({});

describe('LS Function Tests', () => {
  test('ls with empty ids array should return empty ids array', async () => {
    const result = await caller.ls({
      ids: []
    });
    
    expect(result.ids).toEqual([]);
    expect(Array.isArray(result.ids)).toBe(true);
    expect(result.ids.length).toBe(0);
  });
}); 