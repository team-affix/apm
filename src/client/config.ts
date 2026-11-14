import fs from 'fs';
import os from 'os';
import path from 'path';
import { DpmError, Kubo } from '../core';

interface ConfigFile {
    /** The local Kubo node's RPC API. */
    kubo?: string;
}

/**
 * The client's configuration: `$DPM_HOME/config.json`, by default `~/.dpm/client/config.json`: where the local
 * Kubo node's RPC API is. `dpm` talks only to that node. Packages live in IPFS, and everything that involves
 * other machines (fetching from servers, pushing to them) is done by Kubo.
 */
export class ClientConfig {
    private constructor(
        private readonly file: string,
        private readonly data: ConfigFile,
    ) {}

    static load(home = process.env.DPM_HOME ?? path.join(os.homedir(), '.dpm', 'client')): ClientConfig {
        const file = path.join(home, 'config.json');
        if (!fs.existsSync(file)) return new ClientConfig(file, {});
        return new ClientConfig(file, JSON.parse(fs.readFileSync(file, 'utf8')) as ConfigFile);
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
}
