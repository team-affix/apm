import fs from 'fs';
import path from 'path';
import * as tar from 'tar-stream';
import { describe, expect, it } from 'vitest';
import { ArchiveError, packDirectory, unpackToDirectory } from '../src/core';
import { readTree, tmpDir, writeTree } from './helpers';

async function rawTar(entries: (Partial<tar.Header> & { name: string })[]): Promise<Buffer> {
    const pack = tar.pack();
    const chunks: Buffer[] = [];
    pack.on('data', (c) => chunks.push(c as Buffer));
    const done = new Promise<void>((res) => pack.on('end', () => res()));
    for (const header of entries) {
        if (header.type === 'file' || !header.type) pack.entry(header, 'x');
        else pack.entry(header);
    }
    pack.finalize();
    await done;
    return Buffer.concat(chunks);
}

describe('packDirectory / unpackToDirectory', () => {
    const files = { 'a.txt': 'alpha', 'sub/b.txt': 'beta', 'sub/deeper/c.md': 'gamma', '.hidden': 'h' };

    it('round-trips a directory tree', async () => {
        const src = tmpDir();
        writeTree(src, files);
        const dest = path.join(tmpDir(), 'out');
        await unpackToDirectory(await packDirectory(src), dest);
        expect(readTree(dest)).toEqual(files);
    });

    it('is deterministic regardless of timestamps, permissions and creation order', async () => {
        const one = tmpDir();
        writeTree(one, files);
        const two = tmpDir();
        writeTree(two, Object.fromEntries(Object.entries(files).reverse()));
        fs.utimesSync(path.join(two, 'a.txt'), new Date(2001, 1, 1), new Date(2001, 1, 1));
        fs.chmodSync(path.join(two, 'sub/b.txt'), 0o755);
        expect((await packDirectory(one)).equals(await packDirectory(two))).toBe(true);
    });

    it('changes when any content changes', async () => {
        const one = tmpDir();
        writeTree(one, files);
        const two = tmpDir();
        writeTree(two, { ...files, 'a.txt': 'ALPHA' });
        expect((await packDirectory(one)).equals(await packDirectory(two))).toBe(false);
    });

    it('packs an empty directory and unpacks an empty payload', async () => {
        const dest = path.join(tmpDir(), 'out');
        await unpackToDirectory(await packDirectory(tmpDir()), dest);
        expect(readTree(dest)).toEqual({});
        const dest2 = path.join(tmpDir(), 'out2');
        await unpackToDirectory(Buffer.alloc(0), dest2);
        expect(fs.existsSync(dest2)).toBe(true);
    });

    it('refuses to pack symlinks', async () => {
        const src = tmpDir();
        writeTree(src, { 'a.txt': 'a' });
        fs.symlinkSync(path.join(src, 'a.txt'), path.join(src, 'link'));
        await expect(packDirectory(src)).rejects.toThrow(ArchiveError);
    });

    it('refuses to unpack into an existing directory', async () => {
        await expect(unpackToDirectory(Buffer.alloc(0), tmpDir())).rejects.toThrow(ArchiveError);
    });

    it.each([
        ['parent traversal', { name: '../escape.txt' }],
        ['nested traversal', { name: 'ok/../../escape.txt' }],
        ['absolute path', { name: '/tmp/escape.txt' }],
        ['symlink', { name: 'link', type: 'symlink' as const, linkname: '/etc/passwd' }],
        ['hard link', { name: 'link', type: 'link' as const, linkname: 'other' }],
    ])('refuses a malicious archive: %s', async (_, header) => {
        const parent = tmpDir();
        const dest = path.join(parent, 'out');
        await expect(unpackToDirectory(await rawTar([header]), dest)).rejects.toThrow(ArchiveError);
        expect(fs.existsSync(path.join(parent, 'escape.txt'))).toBe(false);
    });

    it('refuses duplicate entries', async () => {
        const dest = path.join(tmpDir(), 'out');
        await expect(unpackToDirectory(await rawTar([{ name: 'a' }, { name: 'a' }]), dest)).rejects.toThrow(
            ArchiveError,
        );
    });

    it('refuses garbage', async () => {
        const dest = path.join(tmpDir(), 'out');
        await expect(unpackToDirectory(Buffer.from('not a tar archive at all'.repeat(40)), dest)).rejects.toThrow(
            ArchiveError,
        );
    });
});
