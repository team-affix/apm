import {
    CachingSource,
    fetchVerified,
    ingest,
    MissingDependencyError,
    Package,
    PackageSource,
    PushResult,
    Registry,
    RemoteRegistry,
    resolve,
    Verifier,
} from '../core';

/**
 * Pulls a package and its resolved dependency tree into the local registry.
 * Each package comes from the first remote that has it (and is checked against its ID).
 */
export async function pull(
    registry: Registry,
    id: string,
    remotes: readonly PackageSource[],
    verify?: Verifier,
): Promise<Package[]> {
    const remote = new CachingSource(remotes);
    const root = await fetchVerified(id, [registry, remote]);
    if (!root) throw new MissingDependencyError([{ id, requiredBy: '(pull)' }]);
    const resolution = await resolve(root, [registry, remote]);
    return ingest(registry, [...resolution.packages, root], { sources: [remote], verify });
}

/**
 * Pushes a local package to a remote, along with any part of its resolved tree that is available
 * locally and missing on the remote. `providers` are passed to the remote so it can fetch anything
 * else it needs (e.g. dependencies we never stored locally) from other registries.
 */
export async function push(
    registry: Registry,
    id: string,
    remote: RemoteRegistry,
    providers: readonly RemoteRegistry[] = [],
): Promise<PushResult> {
    const root = await registry.get(id);
    if (!root) throw new MissingDependencyError([{ id, requiredBy: '(push: not in local registry)' }]);
    const resolution = await resolve(root, [registry, new CachingSource(providers)]);
    const tree = [...resolution.packages, root];

    const local = await registry.has(tree.map((p) => p.id));
    const onRemote = await remote.has(tree.map((p) => p.id));
    const batch = tree.filter((p) => local.has(p.id) && !onRemote.has(p.id));
    if (batch.length === 0) return { ids: [], stored: [] };
    return remote.push(
        batch,
        providers.map((p) => p.url),
    );
}
