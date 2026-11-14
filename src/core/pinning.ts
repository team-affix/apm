import { RemoteError } from './errors';

/**
 * The IPFS Pinning Service API (https://ipfs.github.io/pinning-services-api-spec/), which DPM servers speak.
 * A client asks a server to keep a CID ("pin" it), saying where it can be fetched (`origins`); the server
 * fetches it over IPFS, applies its own policy, and reports the outcome. Content never travels over this API.
 */

export type PinState = 'queued' | 'pinning' | 'pinned' | 'failed';

export interface Pin {
    cid: string;
    name?: string;
    /** Multiaddrs of nodes that have the content: the server fetches from these. */
    origins?: string[];
    meta?: Record<string, string>;
}

export interface PinStatus {
    requestid: string;
    status: PinState;
    /** ISO 8601. */
    created: string;
    pin: Pin;
    /** Multiaddrs of the server's own node: clients should connect to these, so the server can fetch over that. */
    delegates: string[];
    /** Extra information; DPM servers put the reason for a failure in `info.reason`. */
    info?: Record<string, string>;
}

export interface PinResults {
    count: number;
    results: PinStatus[];
}

/** A client for a Pinning Service API endpoint, such as a DPM server. */
export class PinningService {
    constructor(
        public readonly url: string,
        private readonly token?: string,
    ) {}

    private async request<T>(method: string, p: string, body?: unknown): Promise<T> {
        let res: Response;
        try {
            res = await fetch(new URL(p, this.url.endsWith('/') ? this.url : `${this.url}/`), {
                method,
                headers: {
                    ...(body !== undefined && { 'content-type': 'application/json' }),
                    ...(this.token && { authorization: `Bearer ${this.token}` }),
                },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            });
        } catch (e) {
            throw new RemoteError(`Cannot reach ${this.url}: ${(e as Error).message}`);
        }
        const text = await res.text();
        if (!res.ok) {
            let reason = text;
            try {
                const err = (JSON.parse(text) as { error?: { reason?: string; details?: string } }).error;
                reason = [err?.reason, err?.details].filter(Boolean).join(': ') || text;
            } catch {
                // not JSON: keep the text
            }
            throw new RemoteError(`${this.url}: ${res.status} ${reason}`, res.status);
        }
        return (text ? JSON.parse(text) : undefined) as T;
    }

    /** Asks the server to keep `cid`, fetching it from `origins`. */
    add(pin: Pin): Promise<PinStatus> {
        return this.request<PinStatus>('POST', 'pins', pin);
    }

    get(requestid: string): Promise<PinStatus> {
        return this.request<PinStatus>('GET', `pins/${encodeURIComponent(requestid)}`);
    }

    /** Pin requests, optionally only those for some CIDs or in some states. */
    async list(filter: { cid?: readonly string[]; status?: readonly PinState[]; limit?: number } = {}) {
        const q = new URLSearchParams();
        if (filter.cid?.length) q.set('cid', filter.cid.join(','));
        if (filter.status?.length) q.set('status', filter.status.join(','));
        if (filter.limit) q.set('limit', String(filter.limit));
        return (await this.request<PinResults>('GET', `pins${q.size ? `?${q}` : ''}`)).results;
    }

    async remove(requestid: string): Promise<void> {
        await this.request<unknown>('DELETE', `pins/${encodeURIComponent(requestid)}`);
    }

    /** Polls a request until it is pinned or failed, or `timeoutMs` passes (then returns its last state). */
    async wait(requestid: string, timeoutMs = 120_000, intervalMs = 500): Promise<PinStatus> {
        const end = Date.now() + timeoutMs;
        for (;;) {
            const s = await this.get(requestid);
            if (s.status === 'pinned' || s.status === 'failed' || Date.now() >= end) return s;
            await new Promise((r) => setTimeout(r, intervalMs));
        }
    }
}
