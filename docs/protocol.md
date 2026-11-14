# The DPM protocol

DPM is a thin layer over IPFS. IPFS provides identity, storage, transfer and verification; DPM adds only what IPFS does not: how a package names its dependencies, how they are installed, and how servers are asked to keep packages. Anyone may implement a client or server. What a server chooses to *keep* is its own policy.

"MUST", "MUST NOT" and "MAY" are used in their usual specification sense.

## 1. Packages

A **package is a folder**, added to IPFS. Its **ID is the folder's CID**. There are no package names: what is inside the folder, folder names included, is part of its content and so part of its CID.

- A package MAY contain `dpm.json`, listing the packages it depends on, by CID:

  ```json
  { "deps": ["bafy...", "bafy..."] }
  ```

  `deps` MUST contain only CIDs, unique and sorted. No other fields are allowed. A package without `dpm.json` has no dependencies.
- **Dependencies are referenced by CID only, never by location.** Any node holding the content is an equally valid source, and IPFS checks every block against its CID.
- **Import settings are fixed**, so the same folder gets the same CID on every machine: CIDv1, raw leaves, SHA-256, 1 MiB chunks, at most 1024 links per file node, and a HAMT fanout of 256. This is Kubo's `unixfs-v1-2025` profile ([IPIP-499](https://specs.ipfs.tech/ipips/ipip-0499/)), which nodes SHOULD apply so very large folders are also sharded the same way.
- When a project folder is added, `deps/` and hidden entries (names starting with `.`) are left out. Symlinks are not part of packages.

Because a CID fixes the package and, through `dpm.json`, every CID it depends on, **a CID fixes its entire dependency tree.** Nothing outside the package can change what its dependencies are.

## 2. Installing

Installing a project means:

1. Fetching every package reachable from the project's `dpm.json`, following each package's `dpm.json`. Each CID is fetched once, however many packages depend on it.
2. Writing each package to `deps/<cid>/`. The layout is **flat**: every package sits directly under `deps/`, however deep it is in the tree.
3. Writing `deps/graph.json`: `{ "root": [<the project's deps>], "packages": { "<cid>": { "deps": [...] } } }`.
4. Removing any `deps/<cid>/` no longer in the graph.

Installation fails if any CID in the tree cannot be fetched.

DPM never interprets content. What the packages mean, and what to do if two of them clash (for example, two different packages providing the same module), is up to the tools that use them, which can read everything from `deps/` and `graph.json`.

## 3. Servers

A DPM server keeps packages and makes them available. It speaks the **IPFS Pinning Service API** ([spec](https://ipfs.github.io/pinning-services-api-spec/)), so any IPFS tool can use it:

| Request | Meaning |
|---|---|
| `POST /pins` `{ "cid", "name"?, "origins"? }` | Please keep `cid`. `origins` are multiaddrs of nodes that have it. |
| `GET /pins?cid=…&status=…&limit=…` | Requests, filtered by CID and state (default `pinned`) |
| `GET /pins/:requestid` | One request's status |
| `DELETE /pins/:requestid` | Withdraw a request |

**What a server keeps** is answered in Kubo's own RPC format, so clients ask a server exactly what they ask their local node, and the stock `ipfs --api=<server>` command works:

| Request | Meaning |
|---|---|
| `POST /api/v0/pin/ls[?arg=<cid>]` | the server's DPM packages: every package it keeps (its pins named `dpm`, including any dependencies it keeps), and nothing else on its node. With `arg`, an error if it doesn't keep that CID. |
| `POST /api/v0/id` | the server's node: its peer ID and the addresses to connect to |
| `POST /api/v0/version` | the node's version (the `ipfs` command checks it first) |

These are read-only, answered by the server itself. Nothing else under `/api/v0/` is answered, and nothing is passed through to the node's private RPC API.

Statuses go `queued`, then `pinning`, then `pinned` or `failed`. Each carries the server's `delegates`: multiaddrs of its node. A failure's reason is in `info.reason`.

**Content never travels over this API.** To push, a client sends the CID and its own node's addresses as `origins`, then connects its node to the server's `delegates`. The server's node fetches the package over IPFS, from the origins or from any other node that has it. Since the client opened the connection, this works even if the client cannot be reached from outside.

A server:

- MUST fetch the package's whole tree (following `dpm.json`) before reporting it `pinned`, so its policy can look at all of it, and MUST keep the package until the request is withdrawn.
- MAY pin the package's dependencies too. The reference server pins only what was pushed, by default: it fetches the dependencies to apply its policy, without pinning them, so they stay only as cached data until garbage collection, as with anything a Kubo node fetches (`DPM_KEEP_DEPS=1` pins them). A client that wants a server to keep dependencies pushes each of them (`dpm push --with-deps`).
- SHOULD delete what it refused or released (garbage-collect its node), so it stops serving it. A server SHOULD use a node of its own, so everything the node holds is something the server chose to keep.
- MAY refuse any package for any reason, reporting it `failed` with a reason. Acceptance policy is the server's own: the reference server keeps any package whose tree can be fetched, a logic server also requires the content to check, and an operator may add size limits or access tokens.
- MAY require an access token (`Authorization: Bearer <token>`) for adding or withdrawing pins.

Since a CID fixes its whole tree, a server that keeps a CID after checking it has checked exactly that content, permanently.

## 4. Nodes

A node may be shared with other applications. DPM names the pins it creates `dpm`, so its packages can be told apart from other content, and it never renames a pin it didn't create (a CID has one pin).

A node's RPC API is its private admin interface and MUST NOT be exposed. Nodes reach each other through IPFS's own peer-to-peer port. A server exposes that port and its Pinning Service API; a client needs neither exposed, since it only connects out.
