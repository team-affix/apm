import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class Remotes {
    constructor(
        private path: string,
        private remotes: Map<string, string>,
    ) { }

    static load(path: string): Remotes {
        const json = JSON.parse(fs.readFileSync(path, 'utf8'));
        return new Remotes(path, new Map(Object.entries(json)));
    }

    static create(path: string): void {
        const remotes = new Remotes(path, new Map());
        remotes.save();
    }

    save(): void {
        const json = Object.fromEntries(this.remotes);
        fs.writeFileSync(this.path, JSON.stringify(json, null, 2));
    }

    add(name: string, url: string): void {
        this.remotes.set(name, url);
    }

    remove(name: string): void {
        this.remotes.delete(name);
    }

    get(name: string): string | undefined {
        return this.remotes.get(name);
    }

    static getDefault(): Remotes {
        const defaultPath = path.join(os.homedir(), '.apm', 'client', 'remotes.json');

        // Get the parent directory of the default path
        const parentDir = path.dirname(defaultPath);

        // Create the parent directory if it doesn't exist
        if (!fs.existsSync(parentDir))
            fs.mkdirSync(parentDir, { recursive: true });

        // Create the remotes file if it doesn't exist
        if (!fs.existsSync(defaultPath))
            Remotes.create(defaultPath);

        // Load the remotes file
        return Remotes.load(defaultPath);
    }
}
