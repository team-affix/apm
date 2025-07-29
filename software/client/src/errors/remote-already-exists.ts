// Error for when a remote already exists
export class RemoteAlreadyExistsError extends Error {
    constructor(remoteName: string) {
        super(`Remote ${remoteName} already exists`);
        this.name = 'RemoteAlreadyExistsError';
    }
}
