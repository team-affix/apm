// Error thrown when a dependency cannot be removed from a project
class ProjectRemoveError extends Error {
    constructor(cwd: string, id: string, message: string) {
        super(`Failed to remove dependency ${id} from project at ${cwd}: ${message}`);
        this.name = 'ProjectRemoveError';
    }
}

export { ProjectRemoveError };
