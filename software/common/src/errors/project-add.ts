// Error thrown when a dependency cannot be added to a project
class ProjectAddError extends Error {
    constructor(cwd: string, id: string, message: string) {
        super(`Failed to add dependency ${id} to project at ${cwd}: ${message}`);
        this.name = 'ProjectAddError';
    }
}

export { ProjectAddError };
