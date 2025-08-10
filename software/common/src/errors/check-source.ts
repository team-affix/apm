// The error thrown when a source fails to check
class CheckSourceError extends Error {
    // Constructs a check source error
    constructor(cwd: string, message: string) {
        super(`Failed to check source at '${cwd}':\n${message}`);
    }
}

export default CheckSourceError;
