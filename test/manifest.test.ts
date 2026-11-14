import { describe, expect, it } from 'vitest';
import { isCid, ManifestError, manifest, parseManifest, readManifest, writeManifest } from '../src/core';
import { tmpDir } from './helpers';

const A = 'bafybeieedcwo4wyypn4l2r73564segyb3evs7zeeomxbci7pedrif3c2pu';
const B = 'bafybeielfcvgt3wpq3y5aeg3j7n4iz4lpylgqex436uhz6xkepefn524di';

describe('dpm.json', () => {
    it('lists dependencies by CID, deduplicated and sorted', () => {
        expect(manifest([B, A, B])).toEqual({ deps: [A, B] });
    });

    it('recognizes CIDs, and nothing else', () => {
        expect(isCid(A)).toBe(true);
        expect(isCid('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')).toBe(true);
        expect(isCid('Kant')).toBe(false);
        expect(isCid('Base@abc')).toBe(false);
    });

    it.each([
        ['not JSON', '{', /not valid JSON/],
        ['not an object', '[]', /must be a JSON object/],
        ['an unknown field', '{ "name": "Kant", "deps": [] }', /unknown field\(s\): name/],
        ['deps not an array', '{ "deps": "x" }', /must be an array of CIDs/],
        ['something that is not a CID', '{ "deps": ["Kant"] }', /Not a CID: 'Kant'/],
    ])('rejects %s', (_, text, msg) => {
        expect(() => parseManifest(text, 'dpm.json')).toThrow(ManifestError);
        expect(() => parseManifest(text, 'dpm.json')).toThrow(msg);
    });

    it("refuses a folder without dpm.json: it isn't a DPM package", () => {
        expect(() => readManifest(tmpDir())).toThrow(/is not a DPM project: it has no dpm.json/);
    });

    it('writes dpm.json canonically', () => {
        const dir = tmpDir();
        writeManifest(dir, { deps: [B, A] });
        expect(readManifest(dir)).toEqual({ deps: [A, B] });
    });
});
