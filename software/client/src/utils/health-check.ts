import debug from 'debug';
import { HealthCheckError } from '../errors/health-check';

export async function healthCheck(healthUrl: string): Promise<void> {
    // get the debugger
    const dbg = debug('apm:healthCheck');

    // DEBUG: Log the health url
    dbg(`DEBUG - healthCheck: ${healthUrl}`);

    let response: Response;

    try {
        // Make a simple HTTP request to the health endpoint
        response = await fetch(healthUrl);
    } catch (error: unknown) {
        let msg: string;

        if (error instanceof Error) {
            msg = error.message;
        } else {
            msg = String(error);
        }

        throw new HealthCheckError(healthUrl, `Failed to fetch: ${msg}`);
    }

    // DEBUG: Log the response
    dbg(`DEBUG - response: ${response}`);

    // If the request was not successful, throw an error
    if (!response || !response.ok) throw new HealthCheckError(healthUrl, 'Request failed');

    // Get the json response if the request was successful
    const health = await response.json();

    // DEBUG: Log the health
    dbg(`DEBUG - health: ${health}`);

    // If the health check failed, throw an error
    if (health.status !== 'ok') throw new HealthCheckError(healthUrl, `Health status is not ok: ${health}`);
}
