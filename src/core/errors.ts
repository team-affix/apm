/** Base class for every error DPM throws on purpose. */
export class DpmError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/** A dpm.json is missing or malformed, or names something that is not a CID. */
export class ManifestError extends DpmError {}

/** The local IPFS node (Kubo) could not be reached, or refused a request. */
export class KuboError extends DpmError {}

/** A remote DPM server returned an unexpected response. */
export class RemoteError extends DpmError {
    constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
    }
}
