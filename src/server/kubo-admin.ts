import { Kubo } from '../core';

/** The parts of a node's identity peers need: its peer ID and the addresses it can be reached at. */
export interface NodeInfo {
    id: string;
    addresses: string[];
}

/**
 * The admin requests a DPM server makes on its own Kubo node, on top of the read-only ones `dpm` uses:
 * pinning what it decided to keep, unpinning to undo a half-finished pinning, garbage collection, and connecting to the nodes
 * a package is pushed from. `dpm` itself never makes any of these.
 */
export class KuboAdmin extends Kubo {
    async id(): Promise<NodeInfo> {
        const r = await this.json<{ ID: string; Addresses: string[] | null }>('id');
        return { id: r.ID, addresses: r.Addresses ?? [] };
    }

    /** Keeps a CID and everything under it (fetching it if needed). */
    async pin(cid: string): Promise<void> {
        await this.call('pin/add', { arg: cid, recursive: 'true', progress: 'false', timeout: this.timeout });
    }

    async unpin(cid: string): Promise<void> {
        await this.call('pin/rm', { arg: cid, recursive: 'true' });
    }

    /** The CIDs pinned recursively on this node, by anyone. */
    async pins(): Promise<string[]> {
        const r = await this.json<{ Keys?: Record<string, unknown> }>('pin/ls', { type: 'recursive' });
        return Object.keys(r.Keys ?? {});
    }

    /** Deletes everything not pinned, so the node stops serving what the server refused. */
    async gc(): Promise<void> {
        await this.call('repo/gc', { silent: 'true' });
    }

    /** Connects to another node, by a multiaddr that includes its peer ID (`.../p2p/<id>`). */
    async connect(multiaddr: string): Promise<void> {
        await this.call('swarm/connect', { arg: multiaddr, timeout: '15s' });
    }
}
