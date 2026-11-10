import { describe, expect, it } from 'vitest';
import { assertValidName, formatId, InvalidIdError, isValidId, nameOf, parseId } from '../src/core';

const HASH = 'a'.repeat(64);

describe('package names', () => {
    it.each(['Kant', 'my-pkg', 'pkg_1.2', 'Ética', 'λcalc'])('accepts %s', (name) => {
        expect(() => assertValidName(name)).not.toThrow();
    });

    it.each(['', '.', '..', 'a b', 'a/b', 'a\\b', 'a@b', 'a:b', 'tab\there', 'nul\0', 'x'.repeat(201)])(
        'rejects %j',
        (name) => {
            expect(() => assertValidName(name)).toThrow(InvalidIdError);
        },
    );
});

describe('package IDs', () => {
    it('round-trips name and hash', () => {
        const id = formatId('Kant', HASH);
        expect(id).toBe(`Kant@${HASH}`);
        expect(parseId(id)).toEqual({ name: 'Kant', hash: HASH });
        expect(nameOf(id)).toBe('Kant');
    });

    it.each([
        ['missing hash', 'Kant'],
        ['empty name', `@${HASH}`],
        ['short hash', 'Kant@abc'],
        ['uppercase hash', `Kant@${'A'.repeat(64)}`],
        ['non-hex hash', `Kant@${'g'.repeat(64)}`],
        ['bad name', `a/b@${HASH}`],
    ])('rejects %s', (_, id) => {
        expect(isValidId(id)).toBe(false);
        expect(() => parseId(id)).toThrow(InvalidIdError);
    });
});
