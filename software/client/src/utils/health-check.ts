import { HealthCheckError } from '../errors/health-check';

export async function healthCheck(healthUrl: string): Promise<void> {
    // Make a simple HTTP request to the health endpoint
    const response = await fetch(healthUrl);

    // If the request was not successful, throw an error
    if (!response || !response.ok) throw new HealthCheckError(healthUrl, 'Request failed');

    // Get the json response if the request was successful
    const health = await response.json();

    // If the health check failed, throw an error
    if (health.status !== 'ok') throw new HealthCheckError(healthUrl, 'Health status is not ok');
}
