import { RemoteError } from './errors';
import { Package } from './package';
import { PackageSource } from './source';

/**
 * HTTP protocol between DPM clients and registry servers (and between servers, when one asks another
 * for dependencies):
 *
 *   GET  /health                 -> { status: "ok" }
 *   GET  /packages               -> { ids: string[] }
 *   GET  /packages/:id           -> raw package bytes (application/octet-stream), or 404
 *   POST /packages/has           { ids }                  -> { ids }   (the subset present)
 *   POST /packages               { packages, providers }  -> { stored, ids }
 *        packages:  base64 package bytes
 *        providers: registry URLs where dependencies missing from the server and the batch may be found
 */
export interface PushResult {
    /** IDs of every package in the request. */
    ids: string[];
    /** IDs that were newly stored (the rest were already present). */
    stored: string[];
}

/** A client for a remote registry server. Also usable as a dependency source. */
export class RemoteRegistry implements PackageSource {
    public readonly url: string;

    constructor(
        url: string,
        private readonly timeoutMs = 30_000,
    ) {
        this.url = url.replace(/\/+$/, '');
    }

    get label(): string {
        return this.url;
    }

    private async request(path: string, init: RequestInit = {}): Promise<Response> {
        let res: Response;
        try {
            res = await fetch(`${this.url}${path}`, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
        } catch (e) {
            throw new RemoteError(`Cannot reach ${this.url}: ${(e as Error).message}`);
        }
        return res;
    }

    private async json<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.request(
            path,
            body === undefined
                ? {}
                : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
        );
        if (!res.ok) {
            const text = await res.text();
            let message = text;
            try {
                message = (JSON.parse(text) as { error?: string }).error ?? text;
            } catch {
                // not JSON; use the raw text
            }
            throw new RemoteError(`${this.url}${path} failed (${res.status}): ${message}`, res.status);
        }
        return (await res.json()) as T;
    }

    async health(): Promise<void> {
        await this.json('/health');
    }

    async list(): Promise<string[]> {
        return (await this.json<{ ids: string[] }>('/packages')).ids;
    }

    async has(ids: readonly string[]): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        return new Set((await this.json<{ ids: string[] }>('/packages/has', { ids })).ids);
    }

    /** Fetches a package. Returns undefined if absent; throws if the server returns content that isn't `id`. */
    async get(id: string): Promise<Package | undefined> {
        const res = await this.request(`/packages/${encodeURIComponent(id)}`);
        if (res.status === 404) return undefined;
        if (!res.ok) throw new RemoteError(`${this.url} failed to serve ${id} (${res.status})`, res.status);
        const pkg = Package.decode(Buffer.from(await res.arrayBuffer()));
        if (pkg.id !== id) throw new RemoteError(`${this.url} served ${pkg.id} when asked for ${id}`);
        return pkg;
    }

    /** Pushes packages. The server resolves each one (using `providers` for missing dependencies) before storing. */
    async push(packages: readonly Package[], providers: readonly string[] = []): Promise<PushResult> {
        return this.json<PushResult>('/packages', {
            packages: packages.map((p) => p.bytes.toString('base64')),
            providers,
        });
    }
}
