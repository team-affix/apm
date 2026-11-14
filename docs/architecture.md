# Architecture

DPM is a thin layer over IPFS. It has three parts:

1. **The protocol** ([protocol.md](protocol.md)): packages are IPFS folders with a `dpm.json` of dependency CIDs, installed flat into `deps/<cid>/`, and kept by servers that speak the IPFS Pinning Service API.
2. **A library** (`@team-affix/dpm`) for building clients and servers.
3. **Reference implementations**: the `dpm` CLI and `dpm-server`.

```
 your machine                                   a DPM server
 ┌──────────────┐  RPC (private)  ┌──────┐      ┌──────┐  RPC (private)  ┌────────────┐
 │ dpm (client) │ ──────────────▶ │ Kubo │◀────▶│ Kubo │ ◀────────────── │ dpm-server │◀── Pinning
 └──────────────┘                 └──────┘ IPFS └──────┘                 └────────────┘    Service API
                                         (content, hash-checked)                           (requests)
```

Each side runs a Kubo node and talks to it through its private RPC API. Content moves only between Kubo nodes, over IPFS, checked block by block against its CID. The DPM server's public API carries only requests ("please keep this CID") and answers about what it keeps, never content.

The server answers "what do you keep?" in Kubo's own RPC format (`pin/ls`, `id`), limited to its DPM packages. So the client asks a remote server exactly what it asks its own node: `new Kubo(url).pins()` and `isPinned` work against both.

**The `dpm` client only reads from IPFS.** It fetches, exports and lists, but never adds, pins or deletes. Everything that changes what a node keeps is done with Kubo's own `ipfs` command: `ipfs add` for publishing (of the folder `dpm pack` writes), `ipfs pin add` for keeping, and `ipfs pin remote add` for pushing to a server. `dpm` supplies what those commands can't know: which files make up the package (`dpm pack`) and which CIDs make up its tree (`dpm tree`).

## What DPM does, and what it leaves to others

- **IPFS** stores, transfers and verifies content, and gives each folder its CID.
- **DPM** says how a package lists its dependencies (`dpm.json`), how a tree is installed (`deps/<cid>/` plus `graph.json`), and how servers are asked to keep packages.
- **The content's own tools** decide what packages mean, and what to do when two of them clash. For example, Unilog reads module search roots from `deps/*` and reports two packages providing the same module.

DPM has no package names, so it has no name conflicts, no overrides and no resolver. A CID fixes its whole dependency tree.

## Library (`@team-affix/dpm`)

| Part | What it does |
|---|---|
| `Kubo` | A client for a Kubo node's RPC API: `addFolder` (with the fixed import settings), `cat`, `fetch`, `pin`, `unpin`, `pins`, `packages` (pinned folders with a `dpm.json`), `connect`, `exportTo`, `gc`, `id`, `version` |
| `readPackageFolder` | A project folder's files, leaving out `deps/` and hidden entries |
| `manifest`, `parseManifest`, `readManifest`, `writeManifest`, `isCid` | `dpm.json` |
| `fetchTree`, `install`, `readGraph` | Fetch a tree by CID (each package once), and install it flat |
| `PinningService` | A client for the Pinning Service API: `add`, `get`, `list`, `remove`, `wait` |

`@team-affix/dpm/server` has `createServer` (the Pinning Service API in front of a Kubo node, with a `Policy` hook) and `commandPolicy`. `@team-affix/dpm/client` has `pack`, `cidOf`, `tree`, `status`, `installProject` and `ClientConfig`. The server pins and unpins in its own Kubo node; the client never does.

## Server policies

A policy is a function called once a package and its whole tree have been fetched. It returns a reason to refuse, or nothing to keep the package:

```ts
import { createServer, Policy } from '@team-affix/dpm/server';

const policy: Policy = async ({ cid, graph, kubo }) =>
    Object.keys(graph.packages).length > 100 ? 'too many dependencies' : undefined;

const server = await createServer({ kubo, dataDir, policy });
server.http.listen(3000);
```

`commandPolicy(command)` installs the package into a temporary folder (with `deps/` filled in) and keeps it only if `command` succeeds there. A Unilog server is the reference server with `DPM_CHECK="unilog check"`. The DPM client never runs commands; a server runs only the command its operator configured.
