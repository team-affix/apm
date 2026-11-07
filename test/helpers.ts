import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach } from 'vitest';
import { MemorySource, Package } from '../src/core';

const created: string[] = [];

/** A fresh temporary directory, removed after the current test. */
export function tmpDir(prefix = 'dpm-test-'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    created.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Shorthand package constructor: `pkg('A', [b.id], 'content')`. */
export function pkg(name: string, deps: (Package | string)[] = [], payload = ''): Package {
    return Package.create(
        name,
        deps.map((d) => (typeof d === 'string' ? d : d.id)),
        Buffer.from(payload),
    );
}

/** A source holding the given packages. */
export function source(...packages: Package[]): MemorySource {
    return new MemorySource(packages);
}

/** Writes `files` (relative path -> content) under `dir`. */
export function writeTree(dir: string, files: Record<string, string>): void {
    for (const [rel, content] of Object.entries(files)) {
        const file = path.join(dir, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
}

/** Reads every file under `dir` into a relative path -> content map. */
export function readTree(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (rel: string) => {
        for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(r);
            else out[r] = fs.readFileSync(path.join(dir, r), 'utf8');
        }
    };
    walk('');
    return out;
}
