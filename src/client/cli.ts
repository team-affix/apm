#!/usr/bin/env node
import { program } from './program';

/** The `dpm` command: see program.ts for its commands. */
program()
    .parseAsync()
    .catch((e: unknown) => {
        console.error(e);
        process.exitCode = 1;
    });
