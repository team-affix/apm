import { describe, expect, it } from 'vitest';
import { authorizationHeader } from '../src/core';

describe("Kubo API secrets, written as Kubo's API.Authorizations writes them", () => {
    it('turns them into Authorization headers', () => {
        expect(authorizationHeader('bearer:abc')).toBe('Bearer abc');
        expect(authorizationHeader('basic:user:pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    });

    it.each(['abc', 'bearer:', 'basic:user', 'token:abc'])("rejects '%s'", (s) => {
        expect(() => authorizationHeader(s)).toThrow(/bearer:<token>/);
    });
});
