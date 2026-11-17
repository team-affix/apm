import fs from 'fs';
import os from 'os';
import path from 'path';
import { authorizationHeader, DpmError, Kubo } from '../core';

interface ConfigFile {
    /** The Kubo node's HTTP API URL. */
    kubo?: string;
    /** Its secret, if it requires one: `bearer:<token>` or `basic:<user>:<password>`. */
    kuboAuth?: string;
}

/**
 * The client's configuration: `$DPM_HOME/config.json`, by default `~/.dpm/client/config.json`: which Kubo node
 * dpm talks to (its HTTP API URL, and a secret if it requires one). `dpm` talks only to that node; where the node
 * is doesn't matter.
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

    /**
     * The Kubo node dpm talks to, on this machine or another: `$DPM_KUBO_API`, else the configured one,
     * else http://127.0.0.1:5001. Its secret: `$DPM_KUBO_AUTH`, else the configured one.
     */
    kubo(timeout?: string): Kubo {
        return new Kubo(
            process.env.DPM_KUBO_API ?? this.data.kubo ?? 'http://127.0.0.1:5001',
            timeout,
            process.env.DPM_KUBO_AUTH ?? this.data.kuboAuth,
        );
    }

    /** Sets the node, and its secret (none if not given: a secret belongs to one node). */
    setKubo(api: string, auth?: string): void {
        if (!URL.canParse(api)) throw new DpmError(`Invalid URL: ${api}`);
        if (auth) authorizationHeader(auth);
        this.data.kubo = api;
        if (auth) this.data.kuboAuth = auth;
        else delete this.data.kuboAuth;
    }

    /** Forgets the node and its secret: back to the default, http://127.0.0.1:5001. */
    resetKubo(): void {
        delete this.data.kubo;
        delete this.data.kuboAuth;
    }
}
