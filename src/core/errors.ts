/** Base class for every error DPM throws on purpose. */
export class DpmError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/** A package name or package ID is malformed. */
export class InvalidIdError extends DpmError {}

/** Bytes that claim to be a package are not a valid, canonically encoded package. */
export class InvalidPackageError extends DpmError {}

/** Package bytes do not hash to the ID they were claimed (or requested) to have. */
export class IdMismatchError extends InvalidPackageError {
    constructor(
        public readonly expected: string,
        public readonly actual: string,
    ) {
        super(`Package hash check failed: expected ${expected}, but the content hashes to ${actual}`);
    }
}

/** A registry directory is missing or malformed, or a stored package is corrupt. */
export class RegistryError extends DpmError {}

/** A package archive (payload) could not be packed or safely unpacked. */
export class ArchiveError extends DpmError {}

/** A remote registry returned an unexpected response. */
export class RemoteError extends DpmError {
    constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
    }
}

/** One dependency that no source could provide, and the package that asked for it. */
export interface MissingDependency {
    id: string;
    requiredBy: string;
}

/** Base class for dependency resolution failures. */
export class ResolveError extends DpmError {}

/** Some dependencies could not be found in any source. */
export class MissingDependencyError extends ResolveError {
    constructor(public readonly missing: MissingDependency[]) {
        super(
            `No provider found for ${missing.length} dependenc${missing.length === 1 ? 'y' : 'ies'}:\n` +
                missing.map((m) => `  ${m.id} (required by ${m.requiredBy})`).join('\n'),
        );
    }
}

/** Two different packages with the same name meet in one tree and no ancestor overrides that name. */
export class PeerConflictError extends ResolveError {
    constructor(
        public readonly packageName: string,
        public readonly ids: [string, string],
    ) {
        super(
            `Unresolved peer dependency conflict for name '${packageName}':\n` +
                `  ${ids[0]}\n  ${ids[1]}\n` +
                `Resolve it by adding exactly one package named '${packageName}' to a common ancestor's direct dependencies.`,
        );
    }
}

/** A package was rejected by an admission check (e.g. a validator supplied by a layer above DPM). */
export class RejectedError extends DpmError {
    constructor(
        public readonly id: string,
        reason: string,
    ) {
        super(`Package ${id} was rejected: ${reason}`);
    }
}
