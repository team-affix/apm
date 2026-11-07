import { InvalidIdError } from './errors';

/** Length of a hex-encoded SHA-256 digest. */
const HASH_HEX_LENGTH = 64;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Characters a package name may not contain: separators, whitespace, control chars, and filesystem-reserved chars. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_NAME_CHARS = /[\s\x00-\x1f\x7f@/\\:*?"<>|]/u;

/** Maximum name length in UTF-8 bytes (names become directory names, so stay under common filesystem limits). */
const MAX_NAME_BYTES = 200;

/**
 * Throws unless `name` is a valid package name.
 *
 * Names are part of a package's content (and therefore its ID). They are used as directory names when
 * installing, and as the key for override / peer-conflict resolution, so they must be filesystem-safe.
 */
export function assertValidName(name: string): void {
    if (name.length === 0) throw new InvalidIdError('Package name must not be empty');
    if (name === '.' || name === '..') throw new InvalidIdError(`Package name '${name}' is reserved`);
    if (FORBIDDEN_NAME_CHARS.test(name))
        throw new InvalidIdError(
            `Package name '${name}' contains a forbidden character (whitespace, control, @ / \\ : * ? " < > |)`,
        );
    if (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES)
        throw new InvalidIdError(`Package name is longer than ${MAX_NAME_BYTES} bytes`);
}

/** A package ID split into its parts. */
export interface ParsedId {
    name: string;
    hash: string;
}

/**
 * Parses an ID of the form `<name>@<sha256 hex>`.
 *
 * Because the name is part of the ID, a resolver can tell which name slot a dependency occupies
 * without fetching it. The name is still verified on fetch, since it is covered by the hash.
 */
export function parseId(id: string): ParsedId {
    const at = id.lastIndexOf('@');
    if (at < 0) throw new InvalidIdError(`Package ID '${id}' is missing '@<hash>'`);
    const name = id.slice(0, at);
    const hash = id.slice(at + 1);
    assertValidName(name);
    if (hash.length !== HASH_HEX_LENGTH || !HASH_PATTERN.test(hash))
        throw new InvalidIdError(`Package ID '${id}' must end in a lowercase hex SHA-256 digest`);
    return { name, hash };
}

/** Builds an ID from a name and a hex digest. */
export function formatId(name: string, hash: string): string {
    const id = `${name}@${hash}`;
    parseId(id);
    return id;
}

/** The name part of a package ID. */
export function nameOf(id: string): string {
    return parseId(id).name;
}

/** True if `id` is a well-formed package ID. */
export function isValidId(id: string): boolean {
    try {
        parseId(id);
        return true;
    } catch {
        return false;
    }
}
