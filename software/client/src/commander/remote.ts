import { Command, Option } from 'commander';
import { debug } from 'debug';
import * as common from '@team-affix/apm-common';
import { createTrpcClient } from '../trpc/client';
import { getAPIUrl, getHealthUrl, Remotes } from '../models/remotes';
import path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { pull } from '../utils/pull';
import { healthCheck } from '../utils/health-check';
import { version as VERSION } from '../../package.json';
import { push } from '../utils/push';

export const lsCommand = new Command()
    .name('ls')
    .description('Lists the remotes in the remotes file')
    .action(async () => {
        const remotes = Remotes.getDefault();
        console.log(remotes.toString());
    });

export const addCommand = new Command()
    .name('add')
    .description('Adds a remote to the remotes file')
    .argument('<name>', 'The name of the remote')
    .argument('<url>', 'The url of the remote')
    .option('--skip-health-check', 'Skip the health check of the remote')
    .action(async (name: string, url: string, options: { skipHealthCheck: boolean }) => {
        try {
            // If the health check is not disabled, check the health of the remote
            if (!options.skipHealthCheck) {
                // Get the health url
                const healthUrl = getHealthUrl(url);
                // Check the health of the remote
                await healthCheck(healthUrl);
            }

            // Get the remotes
            const remotes = Remotes.getDefault();

            // Add the remote
            remotes.add(name, url);

            // Save the remotes
            remotes.save();
        } catch (error: unknown) {
            let msg = `Failed to add remote '${name}'`;

            if (error instanceof Error) {
                msg += `: ${error.message}`;
            } else {
                msg += `: ${error}`;
            }

            console.error(msg);

            process.exit(1);
        }
    });

export const rmCommand = new Command()
    .name('rm')
    .description('Removes a remote from the remotes file')
    .argument('<name>', 'The name of the remote')
    .action(async (name: string) => {
        try {
            const remotes = Remotes.getDefault();
            remotes.remove(name);
            remotes.save();
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const healthCommand = new Command()
    .name('health')
    .description('Checks the health of the remote')
    .argument('<remote>', 'The remote to check')
    .action(async (remote: string) => {
        try {
            // Get the remotes
            const remotes = Remotes.getDefault();

            // Get the server url
            const serverUrl = remotes.get(remote);

            // Get the health url
            const healthUrl = getHealthUrl(serverUrl);

            // Check the health of the remote
            await healthCheck(healthUrl);
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    });

export const remoteCommand = new Command()
    .name('remote')
    .description("Manages the client's remotes file")
    .addCommand(lsCommand)
    .addCommand(addCommand)
    .addCommand(rmCommand)
    .addCommand(healthCommand);
