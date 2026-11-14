import fs from 'fs';
import os from 'os';
import path from 'path';
import { DpmError, Kubo } from '../core';

/**
 * A remote DPM server, which `dpm` only reads from: which packages it keeps, and its node's addresses. To push to
 * it, use IPFS's own remote pinning (`ipfs pin remote add`).
 */
export interface Remote {
    name: string;
    url: string;
}

interface ConfigFile {
    /** The local Kubo node's RPC API. */
    kubo?: string;
    remotes: Remote[];
}

/**
 * The client's configuration: `$DPM_HOME/config.json`, by default `~/.dpm/client/config.json`. Packages
 * themselves live in IPFS, not here; `dpm` only reads from IPFS, and all changes to what a node keeps are made
 * with the `ipfs` command.
 */
export class ClientConfig {
    private constructor(
        private readonly file: string,
        private readonly data: ConfigFile,
    ) {}

    static load(home = process.env.DPM_HOME ?? path.join(os.homedir(), '.dpm', 'client')): ClientConfig {
        const file = path.join(home, 'config.json');
        if (!fs.existsSync(file)) return new ClientConfig(file, { remotes: [] });
        const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ConfigFile>;
        if (!Array.isArray(data.remotes ?? [])) throw new DpmError(`${file}: "remotes" must be an array`);
        return new ClientConfig(file, { ...data, remotes: data.remotes ?? [] });
    }

    save(): void {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 4) + '\n');
    }

    /** The local Kubo node: `$DPM_KUBO_API`, else the configured one, else http://127.0.0.1:5001. */
    kubo(timeout?: string): Kubo {
        return new Kubo(process.env.DPM_KUBO_API ?? this.data.kubo ?? 'http://127.0.0.1:5001', timeout);
    }

    setKubo(api: string): void {
        if (!URL.canParse(api)) throw new DpmError(`Invalid URL: ${api}`);
        this.data.kubo = api;
    }

    remotes(): readonly Remote[] {
        return this.data.remotes;
    }

    addRemote(remote: Remote): void {
        if (this.data.remotes.some((r) => r.name === remote.name))
            throw new DpmError(`Remote '${remote.name}' already exists`);
        if (!URL.canParse(remote.url)) throw new DpmError(`Invalid URL: ${remote.url}`);
        this.data.remotes.push(remote);
    }

    removeRemote(name: string): void {
        const i = this.data.remotes.findIndex((r) => r.name === name);
        if (i < 0) throw new DpmError(`No remote named '${name}'`);
        this.data.remotes.splice(i, 1);
    }

    /** Remotes by name (all of them if none are named). */
    select(names: readonly string[] = []): Remote[] {
        if (!names.length) return [...this.data.remotes];
        return names.map((n) => {
            const r = this.data.remotes.find((x) => x.name === n);
            if (!r) throw new DpmError(`No remote named '${n}'`);
            return r;
        });
    }
}
