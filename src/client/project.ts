import fs from 'fs';
import path from 'path';
import {
    assertValidName,
    CachingSource,
    DpmError,
    ingest,
    nameOf,
    Package,
    PackageSource,
    packDirectory,
    parseId,
    Registry,
    resolve,
    Resolution,
    unpackToDirectory,
} from '../core';

/**
 * A project is a directory with:
 *
 *   dpm.json       { "name": "<Name>", "deps": ["<id>", ...] }
 *   <Name>/        the project's own content (becomes the package payload)
 *   deps/<Dep>/    installed dependencies, one directory per package name (generated; don't edit)
 *
 * Each package in a resolved tree has a unique name, so `deps/<name>` never collides,
 * and the root's own name is never used by a dependency.
 */
export const MANIFEST = 'dpm.json';
export const DEPS_DIR = 'deps';

export interface Manifest {
    name: string;
    deps: string[];
}

export class Project {
    private constructor(
        public readonly dir: string,
        public readonly manifest: Manifest,
    ) {}

    get name(): string {
        return this.manifest.name;
    }

    get deps(): readonly string[] {
        return this.manifest.deps;
    }

    get sourceDir(): string {
        return path.join(this.dir, this.name);
    }

    get depsDir(): string {
        return path.join(this.dir, DEPS_DIR);
    }

    static load(dir: string): Project {
        const file = path.join(dir, MANIFEST);
        if (!fs.existsSync(file)) throw new DpmError(`No ${MANIFEST} in ${dir}`);
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Manifest>;
        if (typeof raw.name !== 'string') throw new DpmError(`${file}: 'name' must be a string`);
        if (!Array.isArray(raw.deps) || !raw.deps.every((d) => typeof d === 'string'))
            throw new DpmError(`${file}: 'deps' must be an array of package IDs`);
        assertValidName(raw.name);
        raw.deps.forEach(parseId);
        return new Project(dir, { name: raw.name, deps: raw.deps });
    }

    static init(dir: string, name: string): Project {
        assertValidName(name);
        if (fs.existsSync(path.join(dir, MANIFEST))) throw new DpmError(`${dir} already contains ${MANIFEST}`);
        const project = new Project(dir, { name, deps: [] });
        fs.mkdirSync(project.sourceDir, { recursive: true });
        project.save();
        return project;
    }

    private save(): void {
        fs.writeFileSync(path.join(this.dir, MANIFEST), JSON.stringify(this.manifest, null, 4) + '\n');
    }

    /** Adds a direct dependency. A dependency with the same name is replaced (that's how you pick a version). */
    add(id: string): string | undefined {
        const name = nameOf(id);
        if (name === this.name) throw new DpmError(`A project cannot depend on a package with its own name '${name}'`);
        const replaced = this.manifest.deps.find((d) => nameOf(d) === name);
        this.manifest.deps = [...this.manifest.deps.filter((d) => nameOf(d) !== name), id];
        this.save();
        return replaced;
    }

    /** Removes a direct dependency by ID or by name. */
    remove(idOrName: string): void {
        const before = this.manifest.deps.length;
        this.manifest.deps = this.manifest.deps.filter((d) => d !== idOrName && nameOf(d) !== idOrName);
        if (this.manifest.deps.length === before) throw new DpmError(`'${idOrName}' is not a dependency`);
        this.save();
    }

    /** Resolves this project's dependency tree. */
    resolve(sources: readonly PackageSource[]): Promise<Resolution> {
        return resolve(this.manifest, sources);
    }

    /**
     * Resolves the dependency tree and writes every package into `deps/<name>/`.
     * Packages found only in `remotes` are first ingested into the local registry, so it keeps a copy.
     */
    async install(registry: Registry, remotes: readonly PackageSource[] = []): Promise<Resolution> {
        const remote = new CachingSource(remotes);
        const resolution = await this.resolve([registry, remote]);
        await ingest(registry, resolution.packages, [remote]);

        fs.rmSync(this.depsDir, { recursive: true, force: true });
        fs.mkdirSync(this.depsDir, { recursive: true });
        for (const pkg of resolution.packages) await unpackToDirectory(pkg.payload, path.join(this.depsDir, pkg.name));
        return resolution;
    }

    /** Builds a package from `<Name>/` and the manifest, and stores it in the registry if it resolves. */
    async pack(registry: Registry, remotes: readonly PackageSource[] = []): Promise<Package> {
        if (!fs.existsSync(this.sourceDir)) throw new DpmError(`Missing source directory ${this.sourceDir}`);
        const pkg = Package.create(this.name, this.deps, await packDirectory(this.sourceDir));
        await ingest(registry, [pkg], [new CachingSource(remotes)]);
        return pkg;
    }
}
