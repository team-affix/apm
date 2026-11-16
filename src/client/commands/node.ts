import { Command } from 'commander';
import { DpmError } from '../../core';
import { ClientConfig } from '../config';
import { run } from './run';

/** Prints the Kubo dpm uses, and its version (which also shows that dpm can reach it). */
async function showNode(config: ClientConfig) {
    const kubo = config.kubo();
    console.log(`Kubo ${await kubo.version()} at ${kubo.api}`);
}

/** After saving a setting: shows the Kubo, or says it's saved but not reachable yet (e.g. not started). */
async function showSaved(config: ClientConfig) {
    try {
        await showNode(config);
    } catch (e) {
        if (!(e instanceof DpmError)) throw e;
        console.log(`dpm will use the Kubo at ${config.kubo().api}, but can't reach it yet: ${e.message}`);
    }
}

/** `dpm node ...`: which Kubo dpm reads through. */
export function nodeCommand(): Command {
    const node = new Command('node').description(
        'Which Kubo dpm reads through: by default the one running on this machine (http://127.0.0.1:5001)',
    );
    node.command('show', { isDefault: true })
        .description('Show which Kubo dpm reads through, and its version (the default for `dpm node`)')
        .action(run(() => showNode(ClientConfig.load())));
    node.command('set')
        .description('Set the URL of the Kubo HTTP API dpm reads through, and its secret if it requires one')
        .argument('<url>', "the Kubo node's HTTP API, e.g. http://192.168.0.5:5001")
        .argument('[secret]', 'the secret, as Kubo writes them: bearer:<token> or basic:<user>:<password>')
        .action(
            run(async (_dir, url: string, secret?: string) => {
                const config = ClientConfig.load();
                config.setKubo(url, secret);
                config.save();
                await showSaved(config);
            }),
        );
    node.command('reset')
        .description('Go back to the default: the Kubo running on this machine (http://127.0.0.1:5001)')
        .action(
            run(async () => {
                const config = ClientConfig.load();
                config.resetKubo();
                config.save();
                await showSaved(config);
            }),
        );
    return node;
}
