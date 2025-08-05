// Error for when a package fails to pass the vetting process
class VetPackageError extends Error {
    constructor(id: string, message: string) {
        super(`Package ${id} failed the vetting process: ${message}`);
        this.name = 'VetPackageError';
    }
}

export default VetPackageError;
