import { createHash } from 'crypto';
import { IdMismatchError, InvalidPackageError } from './errors';
import { assertValidName, formatId, parseId } from './id';

/**
 * Binary package format, version 1. All integers are unsigned 32-bit little-endian.
 *
 *   magic        4 bytes   "DPM1"
 *   nameLength   u32       length of name in bytes
 *   name         UTF-8
 *   depCount     u32       number of direct dependencies
 *   repeated depCount times:
 *     idLength   u32
 *     id         UTF-8     a package ID, `<name>@<sha256 hex>`
 *   payload      rest      opaque bytes (DPM never interprets them)
 *
 * Encoding is canonical: dependencies are unique and sorted by their UTF-8 bytes. Decoding rejects any
 * byte sequence that is not the canonical encoding of its own contents, so the same (name, deps, payload)
 * always has exactly one encoding and therefore exactly one ID.
 *
 * The package ID is `<name>@<sha256 of the full encoding>`.
 */
const MAGIC = Buffer.from('DPM1', 'ascii');

/** Sorts IDs by their UTF-8 bytes, which is stable across languages (unlike UTF-16 string comparison). */
function canonicalDeps(deps: Iterable<string>): string[] {
    const unique = [...new Set(deps)];
    for (const id of unique) parseId(id);
    return unique.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
}

function u32(n: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(n, 0);
    return buf;
}

function lengthPrefixed(text: string): Buffer[] {
    const bytes = Buffer.from(text, 'utf8');
    return [u32(bytes.length), bytes];
}

function encode(name: string, deps: readonly string[], payload: Buffer): Buffer {
    return Buffer.concat([MAGIC, ...lengthPrefixed(name), u32(deps.length), ...deps.flatMap(lengthPrefixed), payload]);
}

function hashOf(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

/** An immutable, content-addressed package: a name, a set of direct dependency IDs, and an opaque payload. */
export class Package {
    private constructor(
        /** Human-readable name. Part of the content, so it can never change for a given ID. */
        public readonly name: string,
        /** Direct dependency IDs in canonical order. */
        public readonly deps: readonly string[],
        /** Opaque content. DPM never looks inside. */
        public readonly payload: Buffer,
        /** The canonical encoding. These exact bytes are what gets stored and transferred. */
        public readonly bytes: Buffer,
        /** `<name>@<sha256 of bytes>` */
        public readonly id: string,
    ) {}

    /** Builds a package from its parts. Dependencies may be given in any order and are deduplicated. */
    static create(name: string, deps: Iterable<string>, payload: Buffer | Uint8Array = Buffer.alloc(0)): Package {
        assertValidName(name);
        const sorted = canonicalDeps(deps);
        const body = Buffer.from(payload);
        const bytes = encode(name, sorted, body);
        return new Package(name, Object.freeze(sorted), body, bytes, formatId(name, hashOf(bytes)));
    }

    /**
     * Hash verification: decodes `input` and checks that it is the package `expectedId`.
     * Use this wherever bytes arrive with a claimed or requested ID, before doing anything else with them.
     */
    static decodeAs(input: Buffer | Uint8Array, expectedId: string): Package {
        const pkg = Package.decode(input);
        if (pkg.id !== expectedId) throw new IdMismatchError(expectedId, pkg.id);
        return pkg;
    }

    /** Decodes package bytes, rejecting anything that is malformed or not canonically encoded. */
    static decode(input: Buffer | Uint8Array): Package {
        const bytes = Buffer.from(input);
        let offset = 0;

        const take = (n: number, what: string): Buffer => {
            if (offset + n > bytes.length) throw new InvalidPackageError(`Package is truncated while reading ${what}`);
            const slice = bytes.subarray(offset, offset + n);
            offset += n;
            return slice;
        };
        const readU32 = (what: string) => take(4, what).readUInt32LE(0);
        const readText = (what: string) => {
            const raw = take(readU32(`${what} length`), what);
            const text = raw.toString('utf8');
            if (!Buffer.from(text, 'utf8').equals(raw)) throw new InvalidPackageError(`${what} is not valid UTF-8`);
            return text;
        };

        if (!take(MAGIC.length, 'magic').equals(MAGIC)) throw new InvalidPackageError('Not a DPM package (bad magic)');
        const name = readText('name');
        const depCount = readU32('dependency count');
        const deps: string[] = [];
        for (let i = 0; i < depCount; i++) deps.push(readText(`dependency ${i}`));
        const payload = bytes.subarray(offset);

        let pkg: Package;
        try {
            pkg = Package.create(name, deps, payload);
        } catch (e) {
            throw new InvalidPackageError(`Invalid package contents: ${(e as Error).message}`);
        }
        if (!pkg.bytes.equals(bytes))
            throw new InvalidPackageError(
                'Package is not canonically encoded (dependencies must be unique and sorted)',
            );
        return pkg;
    }
}
