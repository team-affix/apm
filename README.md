# DPM: Decentralized Package Manager

DPM is a thin layer over [IPFS](https://ipfs.tech) for packages that depend on each other by content.

- A **package is a folder**, and its **ID is the folder's IPFS CID**. There are no package names: the folder's contents, folder names included, are what it is.
- A package's `dpm.json` lists the packages it depends on, **by CID only**, never by location. Any IPFS node holding the content is as good a source as any other, and every block is checked against its CID.
- `dpm install` fetches the whole tree and lays it out **flat**, as `deps/<cid>/`, each package once, plus `deps/graph.json`. Since a CID fixes its entire dependency tree, there is nothing to resolve: DPM has no names, no overrides and no conflicts. What packages mean, and what to do when two of them clash, is left to the tools that use them.
- **Servers** keep packages and decide what to keep. They speak the standard IPFS Pinning Service API. Pushing never uploads anything: you send the CID, and the server's IPFS node fetches it from yours.

**DPM is a protocol** ([spec](docs/protocol.md)): every server shares the package format, the install rules and the API, and each sets its own acceptance policy. There is **one client, `dpm`**, for every kind of content and every server. Checking content is the job of the content's own tools: a Unilog server is the reference server configured to run `unilog check`.

DPM is the storage layer of a logic platform for public discourse (see [docs/philosophy](docs/philosophy/index.md)), but it knows nothing about logic and works for any kind of content.

## Install

Requires Node.js 20+ and [Kubo](https://github.com/ipfs/kubo/releases), the standard IPFS node (download the `kubo_<version>_<platform>` archive from its GitHub releases; `dist.ipfs.tech` no longer answers since its operator, Shipyard, wound down). Install the npm package from the [latest release](https://github.com/team-affix/apm/releases); it provides `dpm` and `dpm-server`:

```bash
npm install -g https://github.com/team-affix/apm/releases/download/v0.2.0/team-affix-dpm-0.2.0.tgz
ipfs init --profile=unixfs-v1-2025     # once
ipfs daemon                             # keep it running
```

## Quickstart

```bash
# run a server (next to its own Kubo node)
DPM_KUBO_API=http://127.0.0.1:5001 PORT=3000 dpm-server &

dpm remote add home http://localhost:3000

# publish a package
mkdir base && cd base
dpm init
mkdir Kant && echo "duty : \X. good X => ought X;" > Kant/Ethics.ul
BASE=$(dpm push home | head -1)   # prints the CID, then "home: pinned"

# depend on it
mkdir ../app && cd ../app
dpm init
dpm add $BASE
dpm install                        # writes deps/<cid>/Kant/Ethics.ul and deps/graph.json (nothing pinned)
dpm pin $BASE --with-deps          # after checking it: keep it, and its whole tree, in your node
```

See the [protocol spec](docs/protocol.md), the [architecture](docs/architecture.md) (library, server policies), the [CLI reference](docs/cli.md) and the [engineering principles](docs/engineering.md).

## Library

```ts
import { Kubo, install, PinningService } from '@team-affix/dpm';
import { createServer, commandPolicy } from '@team-affix/dpm/server';
import { pack, push, installProject } from '@team-affix/dpm/client';
```

## Releases

Built files are never committed. They are attached to [GitHub Releases](https://github.com/team-affix/apm/releases) by CI:

| File | What it is |
|---|---|
| `dpm-<version>.cjs` | the client as a single file: `node dpm-<version>.cjs install` |
| `dpm-server-<version>.cjs` | the reference server as a single file: `node dpm-server-<version>.cjs` |
| `team-affix-dpm-<version>.tgz` | the npm package (both commands and the library): `npm i -g ./team-affix-dpm-<version>.tgz` |

To release: set a new version in `package.json` and merge to `main`. After the tests pass, CI tags the merge commit `v<version>` and publishes the release. Merges that don't change the version publish nothing. (Pushing a matching `v*` tag by hand also releases.)

## Development

```bash
npm ci
npm test          # vitest; the end-to-end tests run real Kubo nodes (IPFS_BIN or ipfs on the PATH), skipped without one
npm run lint
npm run build
npm run bundle    # single-file dpm and dpm-server in release/
```

Layout:

```
src/core     dpm.json, the Kubo RPC client, install, the Pinning Service API client
src/server   the Pinning Service API server with policies (dpm-server)
src/client   pack / push / install, client config, and the CLI (dpm)
test/        unit tests, and end-to-end tests with real Kubo nodes and servers
docs/        protocol spec, architecture, CLI and philosophy
```
