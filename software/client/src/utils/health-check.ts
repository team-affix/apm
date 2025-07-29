export async function healthCheck(healthUrl: string): Promise<boolean> {
    // Make a simple HTTP request to the health endpoint
    try {
        const response = await fetch(healthUrl);

        // If the request was not successful, return false
        if (!response || !response.ok) return false;

        // Get the json response if the request was successful
        const health = await response.json();

        return health.status === 'ok';
    } catch (error: unknown) {
        return false;
    }
}
