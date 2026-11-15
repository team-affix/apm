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

Each side runs a Kubo node and talks to it through its private RPC API. Content moves only between Kubo nodes, over IPFS, checked block by block against its CID. The DPM server's public API carries only requests ("please keep this CID"), never content, and only Kubo sends them (`ipfs pin remote add`).

**`dpm` is a read-only interface to IPFS.** It talks to one Kubo node, on this machine or another, using four read-only commands, and never adds, pins or deletes ([ipfs.md](ipfs.md) has the details, and how to reach a node on another machine safely). The dividing line: anything that works the same for any IPFS content is done by Kubo's `ipfs` command (adding, pinning, pushing to a server, connecting to a server's node, getting a folder by CID). Anything that needs to know what a DPM package is, is done by `dpm`: which files make up a package (`dpm pack`), which CIDs make up its tree (`dpm tree`), installing a project's dependencies (`dpm install`), and editing `dpm.json`.

## What DPM does, and what it leaves to others

- **IPFS** stores, transfers and verifies content, and gives each folder its CID.
- **DPM** says how a package lists its dependencies (`dpm.json`), how a tree is installed (`deps/<cid>/` plus `graph.json`), and how servers are asked to keep packages.
- **The content's own tools** decide what packages mean, and what to do when two of them clash. For example, Unilog reads module search roots from `deps/*` and reports two packages providing the same module.

DPM has no package names, so it has no name conflicts, no overrides and no resolver. A CID fixes its whole dependency tree.

## Library (`@team-affix/dpm`)

| Part | What it does |
|---|---|
| `Kubo` | A **read-only** client for a Kubo node's HTTP API, on this machine or another: `cat`, `fetch` (Kubo's `refs`), `exportTo` (Kubo's `get`) and `version`. Nothing else. |
| `readPackageFolder` | A project folder's files, leaving out `deps/` and hidden entries |
| `manifest`, `parseManifest`, `readManifest`, `writeManifest`, `isCid` | `dpm.json` |
| `fetchTree`, `install`, `readGraph` | Fetch a tree by CID (each package once), and install it flat |

`@team-affix/dpm/client` has `pack`, `tree` and `ClientConfig`.

`@team-affix/dpm/server` has everything only a server needs:
- `createServer`: the Pinning Service API in front of a Kubo node, with a `Policy` hook;
- `commandPolicy`;
- `KuboAdmin`: the `Kubo` client plus the admin requests a server makes on its own node (`pin`, `unpin`, `pins`, `gc`, `connect`, `id`);
- `PinningService`: a client for the Pinning Service API, and its types.

The client never pins or unpins: the admin requests aren't even in the code it uses.

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
