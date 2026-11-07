import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { InvalidPackageError, Package } from '../src/core';
import { pkg } from './helpers';

const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
};
const str = (s: string) => [u32(Buffer.byteLength(s)), Buffer.from(s)];

describe('Package', () => {
    const dep1 = pkg('Dep1');
    const dep2 = pkg('Dep2');

    it('has a documented, byte-exact encoding', () => {
        const p = Package.create('Root', [dep2.id, dep1.id], Buffer.from('payload'));
        const expected = Buffer.concat([
            Buffer.from('DPM1'),
            ...str('Root'),
            u32(2),
            ...str(dep1.id),
            ...str(dep2.id),
            Buffer.from('payload'),
        ]);
        expect(p.bytes.equals(expected)).toBe(true);
        expect(p.id).toBe(`Root@${createHash('sha256').update(expected).digest('hex')}`);
    });

    it('round-trips through decode', () => {
        const p = pkg('Root', [dep1, dep2], 'hello');
        const back = Package.decode(p.bytes);
        expect(back.id).toBe(p.id);
        expect(back.name).toBe('Root');
        expect(back.deps).toEqual([dep1.id, dep2.id]);
        expect(back.payload.toString()).toBe('hello');
    });

    it('gives the same ID regardless of dependency order or duplicates', () => {
        const a = Package.create('Root', [dep1.id, dep2.id]);
        const b = Package.create('Root', [dep2.id, dep1.id, dep2.id]);
        expect(a.id).toBe(b.id);
        expect(a.deps).toEqual(b.deps);
    });

    it('changes the ID when the name, deps or payload change', () => {
        const base = pkg('Root', [dep1], 'x');
        const ids = [base, pkg('Other', [dep1], 'x'), pkg('Root', [dep2], 'x'), pkg('Root', [dep1], 'y')].map(
            (p) => p.id,
        );
        expect(new Set(ids).size).toBe(4);
    });

    it('measures name length in bytes, not UTF-16 units (multi-byte names)', () => {
        const p = pkg('Ética', [], 'body');
        const back = Package.decode(p.bytes);
        expect(back.name).toBe('Ética');
        expect(back.payload.toString()).toBe('body');
    });

    it('treats the payload as opaque bytes', () => {
        const payload = Buffer.from([0, 1, 2, 255, 0x44, 0x50, 0x4d, 0x31]);
        expect(Package.decode(Package.create('Bin', [], payload).bytes).payload.equals(payload)).toBe(true);
    });

    it('freezes dependencies', () => {
        expect(Object.isFrozen(pkg('Root', [dep1]).deps)).toBe(true);
    });

    describe('decode rejects', () => {
        it('bad magic', () => {
            expect(() => Package.decode(Buffer.from('NOPE'))).toThrow(InvalidPackageError);
        });

        it('every truncation of a valid header', () => {
            const p = pkg('Root', [dep1]);
            const headerLength = p.bytes.length; // no payload, so every byte is header
            for (let n = 0; n < headerLength; n++)
                expect(() => Package.decode(p.bytes.subarray(0, n)), `length ${n}`).toThrow(InvalidPackageError);
        });

        it('unsorted dependencies (non-canonical encoding)', () => {
            const [first, second] = [dep1.id, dep2.id].sort() as [string, string];
            const bytes = Buffer.concat([Buffer.from('DPM1'), ...str('R'), u32(2), ...str(second), ...str(first)]);
            expect(() => Package.decode(bytes)).toThrow(/canonical/);
        });

        it('duplicate dependencies', () => {
            const bytes = Buffer.concat([Buffer.from('DPM1'), ...str('R'), u32(2), ...str(dep1.id), ...str(dep1.id)]);
            expect(() => Package.decode(bytes)).toThrow(InvalidPackageError);
        });

        it('a malformed dependency ID', () => {
            const bytes = Buffer.concat([Buffer.from('DPM1'), ...str('R'), u32(1), ...str('not-an-id')]);
            expect(() => Package.decode(bytes)).toThrow(InvalidPackageError);
        });

        it('an invalid name', () => {
            const bytes = Buffer.concat([Buffer.from('DPM1'), ...str('a/b'), u32(0)]);
            expect(() => Package.decode(bytes)).toThrow(InvalidPackageError);
        });

        it('invalid UTF-8 in the name', () => {
            const bytes = Buffer.concat([Buffer.from('DPM1'), u32(2), Buffer.from([0xc3, 0x28]), u32(0)]);
            expect(() => Package.decode(bytes)).toThrow(/UTF-8/);
        });
    });
});
