import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RemoteAlreadyExistsError } from '../errors/remote-already-exists';
import { RemoteDoesNotExistError } from '../errors/remote-does-not-exist';

export class Remotes {
    constructor(private path: string, private raw: Map<string, string>) {}

    static load(path: string): Remotes {
        const json = JSON.parse(fs.readFileSync(path, 'utf8'));
        return new Remotes(path, new Map(Object.entries(json)));
    }

    static create(path: string): void {
        const remotes = new Remotes(path, new Map());
        remotes.save();
    }

    save(): void {
        const json = Object.fromEntries(this.raw);
        fs.writeFileSync(this.path, JSON.stringify(json, null, 4));
    }

    add(name: string, url: string): void {
        if (this.raw.has(name)) {
            throw new RemoteAlreadyExistsError(name);
        }
        this.raw.set(name, url);
    }

    remove(name: string): void {
        if (!this.raw.has(name)) {
            throw new RemoteDoesNotExistError(name);
        }
        this.raw.delete(name);
    }

    get(name: string): string {
        if (!this.raw.has(name)) {
            throw new RemoteDoesNotExistError(name);
        }
        return this.raw.get(name);
    }

    toString(): string {
        return Array.from(this.raw.entries())
            .map(([name, url]) => `${name}: ${url}`)
            .join('\n');
    }

    static getDefault(): Remotes {
        const defaultPath = path.join(os.homedir(), '.apm', 'client', 'remotes.json');

        // Get the parent directory of the default path
        const parentDir = path.dirname(defaultPath);

        // Create the parent directory if it doesn't exist
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

        // Create the remotes file if it doesn't exist
        if (!fs.existsSync(defaultPath)) Remotes.create(defaultPath);

        // Load the remotes file
        return Remotes.load(defaultPath);
    }
}

export function getHealthUrl(serverUrl: string): string {
    return new URL('/health', serverUrl).toString();
}

export function getAPIUrl(serverUrl: string): string {
    return new URL('/api/trpc', serverUrl).toString();
}
