import fs from 'fs';
import path from 'path';
import * as tar from 'tar-stream';
import { ArchiveError } from './errors';

/**
 * Directory <-> payload helpers. DPM treats payloads as opaque bytes; these are a convenience for the
 * common case where a package's content is a directory of files.
 *
 * Packing is deterministic: the same files and contents always give the same bytes, regardless of
 * timestamps, permissions, ownership or the order the filesystem lists files in. That matters because
 * the payload is hashed into the package ID.
 */

/** Every regular file under `dir`, as POSIX relative paths sorted by their UTF-8 bytes. */
function listFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (rel: string) => {
        for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const childRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(childRel);
            else if (entry.isFile()) out.push(childRel);
            else throw new ArchiveError(`Unsupported file type (only regular files and directories): ${childRel}`);
        }
    };
    walk('');
    return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

/** Packs the regular files under `dir` into a deterministic tar archive. */
export async function packDirectory(dir: string): Promise<Buffer> {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new ArchiveError(`Not a directory: ${dir}`);
    const pack = tar.pack();
    const chunks: Buffer[] = [];
    pack.on('data', (chunk) => chunks.push(chunk as Buffer));
    const finished = new Promise<void>((res, rej) => {
        pack.on('end', res);
        pack.on('error', rej);
    });
    for (const rel of listFiles(dir)) {
        const content = fs.readFileSync(path.join(dir, rel));
        await new Promise<void>((res, rej) =>
            pack.entry(
                {
                    name: rel,
                    size: content.length,
                    mode: 0o644,
                    mtime: new Date(0),
                    uid: 0,
                    gid: 0,
                    uname: '',
                    gname: '',
                },
                content,
                (err) => (err ? rej(err) : res()),
            ),
        );
    }
    pack.finalize();
    await finished;
    return Buffer.concat(chunks);
}

/**
 * Unpacks a payload produced by `packDirectory` into `dest`, which must not exist yet.
 *
 * Payloads come from untrusted sources, so this only creates regular files and directories, and
 * refuses any path that would land outside `dest` (absolute paths, `..`, links).
 */
export async function unpackToDirectory(payload: Buffer, dest: string): Promise<void> {
    if (fs.existsSync(dest)) throw new ArchiveError(`Destination already exists: ${dest}`);
    const root = path.resolve(dest);
    fs.mkdirSync(root, { recursive: true });
    if (payload.length === 0) return;

    const extract = tar.extract();
    extract.end(payload);
    try {
        for await (const entry of extract) {
            const { header } = entry;
            const target = path.resolve(root, header.name.replace(/\/+$/, ''));
            if (path.isAbsolute(header.name) || !target.startsWith(root + path.sep))
                throw new ArchiveError(`Archive entry escapes destination: ${header.name}`);
            if (header.type === 'directory') {
                fs.mkdirSync(target, { recursive: true });
            } else if (header.type === 'file') {
                const chunks: Buffer[] = [];
                for await (const chunk of entry) chunks.push(chunk as Buffer);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                if (fs.existsSync(target)) throw new ArchiveError(`Duplicate archive entry: ${header.name}`);
                fs.writeFileSync(target, Buffer.concat(chunks));
                continue;
            } else {
                throw new ArchiveError(`Unsupported archive entry type '${header.type}': ${header.name}`);
            }
            entry.resume();
        }
    } catch (e) {
        extract.destroy();
        throw e instanceof ArchiveError ? e : new ArchiveError(`Bad archive: ${(e as Error).message}`);
    }
}
