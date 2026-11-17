import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ClientConfig } from '../src/client';
import { tmpDir } from './helpers';

describe('which Kubo dpm talks to (dpm node set / reset)', () => {
    const load = (home: string) => ClientConfig.load(home);

    it('defaults to the Kubo on this machine', () => {
        expect(load(tmpDir()).kubo().api).toBe('http://127.0.0.1:5001');
    });

    it('saves a node and its secret, and reset goes back to the default', () => {
        const home = tmpDir();
        const config = load(home);
        config.setKubo('http://192.168.0.5:5001', 'bearer:read-only');
        config.save();
        expect(load(home).kubo().api).toBe('http://192.168.0.5:5001');
        expect(JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'))).toEqual({
            kubo: 'http://192.168.0.5:5001',
            kuboAuth: 'bearer:read-only',
        });

        const again = load(home);
        again.resetKubo();
        again.save();
        expect(load(home).kubo().api).toBe('http://127.0.0.1:5001');
        expect(JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'))).toEqual({});
    });

    it('forgets the secret when another node is set without one: a secret belongs to one node', () => {
        const config = load(tmpDir());
        config.setKubo('http://a:5001', 'bearer:x');
        config.setKubo('http://b:5001');
        expect(config.kubo().api).toBe('http://b:5001');
        expect(JSON.stringify(config)).not.toContain('bearer:x');
    });

    it('refuses an address that is not a URL, or a malformed secret', () => {
        const config = load(tmpDir());
        expect(() => config.setKubo('not a url')).toThrow(/Invalid URL/);
        expect(() => config.setKubo('http://a:5001', 'secret')).toThrow(/bearer:<token>/);
    });
});
