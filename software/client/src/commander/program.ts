import { Command } from 'commander';
import { version as VERSION } from '../../package.json';
import * as projectCommands from './project';
import * as packageCommands from './package';
import * as remoteCommands from './remote';

// Create a new commander program
export const program = new Command()
    .name('apm')
    .description('Agda Package Manager - A tool for managing Agda packages')
    .version(VERSION);

// Add the primary commands
program.addCommand(projectCommands.projectCommand);
program.addCommand(packageCommands.packageCommand);
program.addCommand(remoteCommands.remoteCommand);

// Add project shorthands
program.addCommand(projectCommands.initCommand);
program.addCommand(projectCommands.installCommand);
program.addCommand(projectCommands.cleanCommand);
program.addCommand(projectCommands.checkCommand);
program.addCommand(projectCommands.packCommand);
program.addCommand(projectCommands.unpackCommand);
// program.addCommand(projectCommands.treeCommand);

// Add package shorthands
program.addCommand(packageCommands.registerCommand);
program.addCommand(packageCommands.infoCommand);
// program.addCommand(packageCommands.treeCommand);
program.addCommand(packageCommands.lsCommand);
program.addCommand(packageCommands.pullCommand);
program.addCommand(packageCommands.pushCommand);
