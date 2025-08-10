// The error thrown when a project fails to check
class CheckProjectError extends Error {
    // Constructs a check project error
    constructor(cwd: string, message: string) {
        super(`Failed to check project at '${cwd}':\n${message}`);
    }
}

export default CheckProjectError;
