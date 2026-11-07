import { MissingDependency, MissingDependencyError, PeerConflictError } from './errors';
import { assertValidName, nameOf, parseId } from './id';
import { Package } from './package';
import { fetchVerified, PackageSource } from './source';

/** What gets resolved: a package, or a project that has not been packed yet (only its name and deps). */
export interface ResolveRoot {
    readonly name: string;
    readonly deps: readonly string[];
}

/** One package in the resolved tree, with the children that survived overriding. */
export interface ResolvedNode {
    readonly pkg: Package;
    readonly children: readonly ResolvedNode[];
}

/** The outcome of a successful resolution. */
export interface Resolution {
    readonly root: ResolveRoot;
    /** The tree under the root, for display. A package reached twice appears twice. */
    readonly tree: readonly ResolvedNode[];
    /** Every package in the resolved closure (excluding the root), dependencies before dependents. */
    readonly packages: readonly Package[];
}

/**
 * Resolves the full transitive closure of `root`, fetching packages from `sources` in order (first verified hit wins).
 *
 * Rules (the same as APM's):
 * - Within one resolved tree there is at most one package per name.
 * - Overrides: if a package lists a dependency named N directly, every package named N deeper in that
 *   package's subtree is replaced by it. The root also occupies its own name, so it overrides any
 *   transitive package with the same name.
 * - Peer conflicts: if two different packages named N meet without a common ancestor overriding N, resolution fails.
 *   The fix is for an ancestor (usually the root) to depend directly on the N it wants.
 * - Overridden dependencies are never fetched. Their name is in their ID, so no download is needed to
 *   know they're overridden, and it doesn't matter whether any source has them.
 *
 * All dependencies that no source can provide are collected and reported together.
 */
export async function resolve(root: ResolveRoot, sources: readonly PackageSource[]): Promise<Resolution> {
    assertValidName(root.name);
    for (const id of root.deps) parseId(id);

    const rootLabel = 'id' in root && typeof root.id === 'string' ? root.id : root.name;
    /** name -> the ID chosen for that name, across the whole tree. */
    const chosen = new Map<string, string>();
    const fetched = new Map<string, Package>();
    const firstNode = new Map<string, ResolvedNode>();
    const missing = new Map<string, MissingDependency>();
    /** (id, override context) pairs already explored. A subtree's contents depend on the overrides above it. */
    const explored = new Set<string>();

    async function visit(
        deps: readonly string[],
        overrides: ReadonlySet<string>,
        requiredBy: string,
    ): Promise<ResolvedNode[]> {
        const active = deps.filter((id) => !overrides.has(nameOf(id)));
        const childOverrides = new Set([...overrides, ...active.map(nameOf)]);
        const contextKey = [...childOverrides].sort().join('\0');
        const nodes: ResolvedNode[] = [];

        for (const id of active) {
            const name = nameOf(id);
            const previous = chosen.get(name);
            if (previous !== undefined && previous !== id) throw new PeerConflictError(name, [previous, id]);
            chosen.set(name, id);

            const pkg = fetched.get(id) ?? (await fetchVerified(id, sources));
            if (!pkg) {
                if (!missing.has(id)) missing.set(id, { id, requiredBy });
                continue;
            }
            fetched.set(id, pkg);

            const key = `${id}\n${contextKey}`;
            if (explored.has(key)) {
                const node = firstNode.get(id);
                if (node) nodes.push(node);
                continue;
            }
            explored.add(key);

            const children = await visit(pkg.deps, childOverrides, id);
            const node = firstNode.get(id) ?? { pkg, children };
            firstNode.set(id, node);
            nodes.push(node);
        }
        return nodes;
    }

    const tree = await visit(root.deps, new Set([root.name]), rootLabel);
    if (missing.size > 0) throw new MissingDependencyError([...missing.values()]);

    return { root, tree, packages: topologicalOrder([...fetched.values()]) };
}

/** Orders packages so each comes after all of its dependencies that are also in the list. */
function topologicalOrder(packages: Package[]): Package[] {
    const byId = new Map(packages.map((p) => [p.id, p]));
    const done = new Set<string>();
    const out: Package[] = [];
    const sorted = [...byId.keys()].sort();
    // Content addressing makes dependency cycles impossible, so a plain DFS terminates.
    const walk = (id: string) => {
        if (done.has(id)) return;
        done.add(id);
        const pkg = byId.get(id);
        if (!pkg) return;
        for (const dep of pkg.deps) walk(dep);
        out.push(pkg);
    };
    sorted.forEach(walk);
    return out;
}

/** Renders a resolution as an indented tree. */
export function formatTree(resolution: Resolution): string {
    const lines: string[] = [resolution.root.name];
    const draw = (nodes: readonly ResolvedNode[], prefix: string) => {
        nodes.forEach((node, i) => {
            const last = i === nodes.length - 1;
            lines.push(`${prefix}${last ? '└── ' : '├── '}${node.pkg.id}`);
            draw(node.children, prefix + (last ? '    ' : '│   '));
        });
    };
    draw(resolution.tree, '');
    return lines.join('\n');
}
