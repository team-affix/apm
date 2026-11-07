import fs from 'fs';
import os from 'os';
import path from 'path';
import { DpmError, Registry, RemoteRegistry } from '../core';

/** Client state directory: `$DPM_HOME`, or `~/.dpm/client`. */
export function clientHome(): string {
    return process.env.DPM_HOME ?? path.join(os.homedir(), '.dpm', 'client');
}

/** The client's local registry: `$DPM_REGISTRY`, or `<home>/registry`. */
export function localRegistry(): Registry {
    return Registry.openOrCreate(process.env.DPM_REGISTRY ?? path.join(clientHome(), 'registry'));
}

export interface Remote {
    name: string;
    url: string;
}

/** The configured remote registries, in priority order (stored in `<home>/remotes.json`). */
export class Remotes {
    private constructor(
        private readonly file: string,
        private readonly entries: Remote[],
    ) {}

    static load(file = path.join(clientHome(), 'remotes.json')): Remotes {
        if (!fs.existsSync(file)) return new Remotes(file, []);
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
        if (!Array.isArray(parsed)) throw new DpmError(`${file} must contain a JSON array of { name, url }`);
        return new Remotes(file, parsed as Remote[]);
    }

    save(): void {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 4) + '\n');
    }

    list(): readonly Remote[] {
        return this.entries;
    }

    add(name: string, url: string): void {
        if (this.entries.some((r) => r.name === name)) throw new DpmError(`Remote '${name}' already exists`);
        if (!URL.canParse(url)) throw new DpmError(`Invalid URL: ${url}`);
        this.entries.push({ name, url });
    }

    remove(name: string): void {
        const i = this.entries.findIndex((r) => r.name === name);
        if (i < 0) throw new DpmError(`No remote named '${name}'`);
        this.entries.splice(i, 1);
    }

    get(name: string): RemoteRegistry {
        const entry = this.entries.find((r) => r.name === name);
        if (!entry) throw new DpmError(`No remote named '${name}'`);
        return new RemoteRegistry(entry.url);
    }

    /** All remotes as registries, optionally excluding some by name. */
    all(except: readonly string[] = []): RemoteRegistry[] {
        return this.entries.filter((r) => !except.includes(r.name)).map((r) => new RemoteRegistry(r.url));
    }
}
