// Error for when a package cannot be put into the registry
class PutPackageError extends Error {
    constructor(id: string, message: string) {
        super(`Package ${id} cannot be put into the registry: ${message}`);
        this.name = 'PutPackageError';
    }
}

export default PutPackageError;
