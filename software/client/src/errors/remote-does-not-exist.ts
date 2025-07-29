// Error for when a remote does not exist
export class RemoteDoesNotExistError extends Error {
    constructor(remoteName: string) {
        super(`Remote ${remoteName} does not exist`);
        this.name = 'RemoteDoesNotExistError';
    }
}
