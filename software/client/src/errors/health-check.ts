// Error for when the health check fails
export class HealthCheckError extends Error {
    constructor(healthUrl: string, message: string) {
        super(`Remote health check failed at ${healthUrl}: ${message}`);
        this.name = 'HealthCheckError';
    }
}
