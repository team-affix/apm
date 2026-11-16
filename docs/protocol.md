# The DPM protocol

DPM is a thin layer over IPFS. IPFS provides identity, storage, transfer and verification; DPM adds only what IPFS does not: how a package names its dependencies, and how they are installed. Sharing packages is plain IPFS: any node, or any IPFS pinning service, can keep and serve them.

"MUST", "MUST NOT" and "MAY" are used in their usual specification sense.

## 1. Packages

A **package is a folder**, added to IPFS. Its **ID is the folder's CID**. There are no package names: what is inside the folder, folder names included, is part of its content and so part of its CID.

- A package MUST contain `dpm.json` at its top level, listing the packages it depends on, by CID:

  ```json
  { "deps": ["bafy...", "bafy..."] }
  ```

  `deps` MUST contain only CIDs, unique and sorted (`[]` for none). No other fields are allowed. `dpm.json` is what makes a folder a DPM package: a folder without one is not a package, and a dependency that isn't a package is an error. Since the file is part of the content, any node can tell whether a CID is a DPM package by looking inside it; nothing else marks packages.
- **Dependencies are referenced by CID only, never by location.** Any node holding the content is an equally valid source, and IPFS checks every block against its CID.
- **Import settings are fixed**, so the same folder gets the same CID on every machine: CIDv1, raw leaves, SHA-256, 1 MiB chunks, at most 1024 links per file node, and a HAMT fanout of 256. This is Kubo's `unixfs-v1-2025` profile ([IPIP-499](https://specs.ipfs.tech/ipips/ipip-0499/)), which nodes SHOULD apply so very large folders are also sharded the same way.
- A project's package is its folder without `deps/` and without hidden entries (names starting with `.`). Symlinks are not part of packages.

Because a CID fixes the package and, through `dpm.json`, every CID it depends on, **a CID fixes its entire dependency tree.** Nothing outside the package can change what its dependencies are.

## 2. Installing

Installing a project means:

1. Fetching every package reachable from the project's `dpm.json`, following each package's `dpm.json`. Each CID is fetched once, however many packages depend on it.
2. Writing each package to `deps/<cid>/`. The layout is **flat**: every package sits directly under `deps/`, however deep it is in the tree.
3. Removing any `deps/<cid>/` no longer in the tree.

Each installed package keeps its own `dpm.json`, so the whole tree is on disk: start from the project's `dpm.json`, and follow each CID to `deps/<cid>/dpm.json`.

Installation fails if any CID in the tree cannot be fetched. Packages are fetched over IPFS from whichever node has them.

DPM never interprets content. What the packages mean, and what to do if two of them clash (for example, two different packages providing the same module), is up to the tools that use them, which can read everything from `deps/`.

## 3. Sharing packages

DPM defines no server and no API of its own. Packages are shared the way any IPFS content is:

- **Publishing** is adding the package's folder to an IPFS node (`ipfs add -r`). Anyone who can reach that node, or any other node holding the content, can fetch it by CID.
- **Keeping packages available** is pinning them on nodes that stay online. A user can ask any **IPFS pinning service** to keep a package, with Kubo's own `ipfs pin remote add --service=<service> <cid>`. Nothing is uploaded: the service's node fetches the package over IPFS from the user's node.
- **Fetching** works from any node that has the package. To fetch from a particular service reliably, a client keeps its node connected to the service's node (Kubo's peering).

A pinning service keeps only the CID it was asked to keep, not that package's dependencies. To keep a whole tree, ask it to keep each CID that `dpm tree <cid>` prints.

What a service chooses to keep is its own policy. A service may check packages before keeping them. [unilog-server](https://github.com/team-affix/unilog-server) does this: it keeps a package only if the package and its whole tree check with Unilog, and it never removes what it accepted. Since a CID fixes its whole tree, a service that keeps a CID after checking it has checked exactly that content, permanently.

## 4. Nodes

A node may be shared with other applications. DPM adds nothing to a node: pins carry no DPM-specific name or label, and a package is recognised only by its content (a `dpm.json` at the top level).

A node's RPC API is its private admin interface and MUST NOT be exposed as it is (see [ipfs.md](ipfs.md) for giving `dpm` read-only access to a node on another machine). Nodes reach each other through IPFS's own peer-to-peer port.
