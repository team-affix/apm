#!/usr/bin/env node

import { program } from './commander/program';

// Parse command line arguments
program.parse();

// If no command is provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
