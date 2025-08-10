import { glob } from 'glob';
import * as tarFs from 'tar-fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import fs from 'fs';
import debug from 'debug';
import SourceLoadError from '../errors/source-load';
import SourceCreateError from '../errors/source-create';

// A source type, which is just a directory of source files
export class Source {
    private constructor(
        public readonly cwd: string,
        public readonly agdaFiles: string[],
        public readonly mdFiles: string[],
        public readonly miscFiles: string[],
    ) {}

    // Create a source from a cwd
    static async load(cwd: string): Promise<Source> {
        // Check if the cwd exists
        if (!fs.existsSync(cwd)) throw new SourceLoadError(cwd, 'Path does not exist');
        // Check if the cwd is a directory
        if (!fs.statSync(cwd).isDirectory()) throw new SourceLoadError(cwd, 'Path is not a directory');
        // Get the agda files
        const agdaFiles = await glob('**/*.agda', { cwd, nodir: true, dot: true });

        // Get the md files
        const mdFiles = await glob('**/*.md', { cwd, nodir: true, dot: true });

        // Get the misc files
        const miscFiles = await glob('**/*', { cwd, nodir: true, ignore: ['**/*.agda', '**/*.md'], dot: true });

        // Return the source
        return new Source(cwd, agdaFiles, mdFiles, miscFiles);
    }

    // Creates a source at the specified path (expects the directory to NOT EXIST)
    static async create(cwd: string, archive?: Readable): Promise<Source> {
        // Get the debugger
        const dbg = debug('apm:common:models:Source:create');

        // Indicate that we are initializing a source
        dbg(`Initializing source at ${cwd}`);

        // Expect the cwd to not exist
        if (fs.existsSync(cwd)) throw new SourceCreateError(cwd, 'Path already exists');

        // Create the cwd
        fs.mkdirSync(cwd, { recursive: true });

        // If an archive is provided, extract it into cwd
        if (archive) await pipeline(archive, tarFs.extract(cwd));

        // Return the source
        return Source.load(cwd);
    }

    // Pack the source into an archive
    getArchive(): Readable {
        // Concatenate the agda files and the md files
        const files = [...this.agdaFiles, ...this.mdFiles];

        // Pack the files into a tar
        return tarFs.pack(this.cwd, { entries: files });
    }
}

export const __test__ = {};
