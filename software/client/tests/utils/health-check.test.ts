import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Package, Registry, Source } from '@team-affix/apm-common';
import { Remotes } from '../../src/models/remotes';
import { healthCheck } from '../../src/utils/health-check';
import { HealthCheckError } from '../../src/errors/health-check';

const TEST_REMOTE_HEALTH_URL = 'https://example.com/health';

describe('healthCheck', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    // Clean up after each test
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('success cases', () => {
        it('passes silently if fetch response is ok and health status is ok', async () => {
            // Mock the fetch function to return a response that is ok and has a health status of ok
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: 'ok' }),
            });

            // Assert that the function does not throw
            await expect(healthCheck(TEST_REMOTE_HEALTH_URL)).resolves.not.toThrow();
        });
    });
    describe('failure cases', () => {
        it('should throw HealthCheckError if fetch() fails', async () => {
            // Mock the fetch function to throw an error
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

            // Assert that the function throws a HealthCheckError
            await expect(healthCheck(TEST_REMOTE_HEALTH_URL)).rejects.toThrow(HealthCheckError);
        });

        it('should throw HealthCheckError if fetch response is falsy', async () => {
            // Mock the fetch function to return a falsy response
            (global.fetch as jest.Mock).mockResolvedValue(null);

            // Assert that the function throws a HealthCheckError
            await expect(healthCheck(TEST_REMOTE_HEALTH_URL)).rejects.toThrow(HealthCheckError);
        });

        it('should throw HealthCheckError if fetch response is not ok', async () => {
            // Mock the fetch function to return a response that is not ok
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ status: 'error' }),
            });

            // Assert that the function throws a HealthCheckError
            await expect(healthCheck(TEST_REMOTE_HEALTH_URL)).rejects.toThrow(HealthCheckError);
        });

        it('should throw HealthCheckError if fetch response is ok but health status is not ok', async () => {
            // Mock the fetch function to return a response that is not ok
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: 'critical' }),
            });

            // Assert that the function throws a HealthCheckError
            await expect(healthCheck(TEST_REMOTE_HEALTH_URL)).rejects.toThrow(HealthCheckError);
        });
    });
});
