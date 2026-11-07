import http from 'http';
import { ingest, Registry, RemoteRegistry } from '../core';
import {
    handle,
    HttpError,
    matchRoute,
    parseHasRequest,
    parsePushRequest,
    readJson,
    sendJson,
    sendPackage,
} from './protocol';

export interface ServerOptions {
    /** Where accepted packages are stored. */
    registry: Registry;
    /** Largest accepted request body, in bytes. Default 64 MiB. */
    maxBodyBytes?: number;
    /**
     * Whether pushers may name provider registries for the server to fetch missing dependencies from.
     * When false, every dependency must already be on this server or in the pushed batch. Default true.
     */
    allowProviders?: boolean;
    /** Most provider URLs accepted per push. Default 16. */
    maxProviders?: number;
}

/**
 * The reference DPM server. Its acceptance policy is the protocol's minimum: a push is accepted if
 * every package passes the hash check and resolves. Servers with other policies build their own
 * handler from the parts in `./protocol` (this file is a worked example of doing that).
 */
export function createHandler(options: ServerOptions): http.RequestListener {
    const { registry } = options;
    const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024 * 1024;
    const allowProviders = options.allowProviders ?? true;
    const maxProviders = options.maxProviders ?? 16;

    return handle(async (req, res) => {
        const route = matchRoute(req);
        switch (route?.kind) {
            case 'health':
                return sendJson(res, 200, { status: 'ok' });
            case 'list':
                return sendJson(res, 200, { ids: await registry.list() });
            case 'has': {
                const ids = parseHasRequest(await readJson(req, maxBodyBytes));
                return sendJson(res, 200, { ids: [...(await registry.has(ids))] });
            }
            case 'get': {
                const pkg = await registry.get(route.id);
                if (!pkg) throw new HttpError(404, `Package not found: ${route.id}`);
                return sendPackage(res, pkg);
            }
            case 'push': {
                const { packages, providers } = parsePushRequest(await readJson(req, maxBodyBytes));
                if (providers.length > 0 && !allowProviders)
                    throw new HttpError(400, 'This server does not fetch from provider registries');
                if (providers.length > maxProviders)
                    throw new HttpError(400, `At most ${maxProviders} provider registries are accepted`);
                const stored = await ingest(
                    registry,
                    packages,
                    providers.map((url) => new RemoteRegistry(url)),
                );
                return sendJson(res, 200, { ids: packages.map((p) => p.id), stored: stored.map((p) => p.id) });
            }
            default:
                throw new HttpError(404, `No route for ${req.method} ${req.url}`);
        }
    });
}

/** Creates (but does not start) the reference DPM server. */
export function createServer(options: ServerOptions): http.Server {
    return http.createServer(createHandler(options));
}
