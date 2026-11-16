import path from 'path';
import { Command } from 'commander';
import { DpmError } from '../../core';

/**
 * Wraps a command's action: prints DPM errors without a stack trace, and gives the action the project directory
 * (`-C <dir>`, an option of the whole program, so it works with every command, long form or shorthand).
 */
export function run<A extends unknown[]>(action: (dir: string, ...args: A) => Promise<void> | void) {
    return async (...args: [...A, Command]) => {
        const command = args[args.length - 1] as Command;
        const { dir } = command.optsWithGlobals<{ dir?: string }>();
        try {
            await action(path.resolve(dir ?? '.'), ...(args.slice(0, -1) as unknown as A));
        } catch (e) {
            if (!(e instanceof DpmError)) throw e;
            console.error(e.message);
            process.exitCode = 1;
        }
    };
}

/** How long fetching one package may take: an option of the commands that fetch. */
export const TIMEOUT = ['--timeout <duration>', 'how long fetching one package may take, e.g. 60s', '120s'] as const;
