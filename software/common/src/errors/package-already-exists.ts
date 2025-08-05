// Error thrown when a package already exists
class PackageAlreadyExistsError extends Error {
    constructor(registryRoot: string, id: string) {
        super(`Package ${id} already exists in ${registryRoot}`);
        this.name = 'PackageAlreadyExistsError';
    }
}

export default PackageAlreadyExistsError;
