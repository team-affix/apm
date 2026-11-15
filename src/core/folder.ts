import fs from 'fs';
import path from 'path';

/** A file or folder in a package, by its path inside the package ('/'-separated). */
export type Entry = { path: string; dir: true } | { path: string; dir?: false; content: Buffer };

/** Every file and folder in a project directory that is part of its package: hidden entries and `deps/` are left out. */
export function readPackageFolder(dir: string, exclude: readonly string[] = ['deps']): Entry[] {
    const out: Entry[] = [];
    const walk = (rel: string) => {
        const abs = path.join(dir, rel);
        for (const name of fs.readdirSync(abs).sort()) {
            if (name.startsWith('.')) continue;
            const relPath = rel ? `${rel}/${name}` : name;
            if (!rel && exclude.includes(name)) continue;
            const stat = fs.lstatSync(path.join(abs, name));
            if (stat.isDirectory()) {
                out.push({ path: relPath, dir: true });
                walk(relPath);
            } else if (stat.isFile()) out.push({ path: relPath, content: fs.readFileSync(path.join(abs, name)) });
        }
    };
    walk('');
    return out;
}
