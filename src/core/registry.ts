import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { RegistryError } from './errors';
import { isValidId } from './id';
import { Package } from './package';
import { PackageSource } from './source';

const PACKAGES_DIR = 'packages';

/**
 * A registry on local disk: a directory of package files, each named by its ID.
 *
 * Deliberately dumb. It only stores and returns bytes, and guarantees that a stored file's name is the
 * ID of its contents. It knows nothing about dependency resolution, validation or policy; callers decide
 * what to `put` (see `ingest`).
 */
export class Registry implements PackageSource {
    private constructor(public readonly root: string) {}

    get label(): string {
        return this.root;
    }

    private get packagesDir(): string {
        return path.join(this.root, PACKAGES_DIR);
    }

    private pathOf(id: string): string {
        if (!isValidId(id)) throw new RegistryError(`Invalid package ID: ${id}`);
        return path.join(this.packagesDir, id);
    }

    /** Opens an existing registry. */
    static open(root: string): Registry {
        if (!fs.existsSync(path.join(root, PACKAGES_DIR)))
            throw new RegistryError(`No registry at ${root} (missing '${PACKAGES_DIR}' directory)`);
        return new Registry(root);
    }

    /** Opens the registry at `root`, creating it if it doesn't exist. */
    static openOrCreate(root: string): Registry {
        fs.mkdirSync(path.join(root, PACKAGES_DIR), { recursive: true });
        return new Registry(root);
    }

    /** Stores a package. Storing a package that is already present does nothing. */
    async put(pkg: Package): Promise<void> {
        const dest = this.pathOf(pkg.id);
        if (fs.existsSync(dest)) return;
        // Write to a temp file and rename, so a crash never leaves a partial file under a valid ID.
        const tmp = path.join(this.packagesDir, `.tmp-${randomBytes(8).toString('hex')}`);
        await fs.promises.writeFile(tmp, pkg.bytes);
        await fs.promises.rename(tmp, dest);
    }

    /** The package with this ID, or undefined. Throws if the stored file is corrupt. */
    async get(id: string): Promise<Package | undefined> {
        if (!isValidId(id)) return undefined;
        let bytes: Buffer;
        try {
            bytes = await fs.promises.readFile(this.pathOf(id));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw e;
        }
        let pkg: Package;
        try {
            pkg = Package.decode(bytes);
        } catch (e) {
            throw new RegistryError(`Stored package ${id} is corrupt: ${(e as Error).message}`);
        }
        if (pkg.id !== id) throw new RegistryError(`Stored package ${id} is corrupt: its content hashes to ${pkg.id}`);
        return pkg;
    }

    /** The subset of `ids` that are stored here. */
    async has(ids: readonly string[]): Promise<Set<string>> {
        return new Set(ids.filter((id) => isValidId(id) && fs.existsSync(this.pathOf(id))));
    }

    /** Every stored package ID, sorted. */
    async list(): Promise<string[]> {
        const files = await fs.promises.readdir(this.packagesDir);
        return files.filter(isValidId).sort();
    }
}
