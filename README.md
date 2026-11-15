# DPM: Decentralized Package Manager

DPM is a thin layer over [IPFS](https://ipfs.tech) for packages that depend on each other by content.

- A **package is a folder**, and its **ID is the folder's IPFS CID**. There are no package names: the folder's contents, folder names included, are what it is.
- A package's `dpm.json` lists the packages it depends on, **by CID only**, never by location. Any IPFS node holding the content is as good a source as any other, and every block is checked against its CID.
- `dpm install` fetches the whole tree and lays it out **flat**, as `deps/<cid>/`, each package once, plus `deps/graph.json`. Since a CID fixes its entire dependency tree, there is nothing to resolve: DPM has no names, no overrides and no conflicts. What packages mean, and what to do when two of them clash, is left to the tools that use them.
- **Servers** keep packages and decide what to keep. They speak the standard IPFS Pinning Service API, so you push with Kubo's own `ipfs pin remote add`. Pushing never uploads anything: you send the CID, and the server's IPFS node fetches it from yours.
- **`dpm` is a read-only interface to IPFS.** It reads packages through the Kubo node running on your machine, and never changes anything in IPFS. Adding, pinning, pushing and connecting to servers are done with the `ipfs` command; `dpm` handles what needs package knowledge: what to add (`dpm pack`), which CIDs make up a tree (`dpm tree`), and installing. See [how DPM uses IPFS](docs/ipfs.md).

**DPM is a protocol** ([spec](docs/protocol.md)): every server shares the package format, the install rules and the API, and each sets its own acceptance policy. There is **one client, `dpm`**, for every kind of content and every server. Checking content is the job of the content's own tools: a Unilog server is the reference server configured to run `unilog check`.

DPM is the storage layer of a logic platform for public discourse (see [docs/philosophy](docs/philosophy/index.md)), but it knows nothing about logic and works for any kind of content.

## Install

Requires Node.js 20+ and [Kubo](https://github.com/ipfs/kubo/releases), the standard IPFS node (download the `kubo_<version>_<platform>` archive from its GitHub releases; `dist.ipfs.tech` no longer answers since its operator, Shipyard, wound down). Install the npm package from the [latest release](https://github.com/team-affix/apm/releases); it provides `dpm` and `dpm-server`:

```bash
npm install -g https://github.com/team-affix/apm/releases/download/v0.2.0/team-affix-dpm-0.2.0.tgz
ipfs init --profile=unixfs-v1-2025     # once (existing node: ipfs config profile apply unixfs-v1-2025)
ipfs daemon                             # leave it running: dpm and the ipfs command both use it
```

## Quickstart

```bash
# run a server (next to its own Kubo node)
DPM_KUBO_API=http://127.0.0.1:5001 PORT=3000 dpm-server &

ipfs pin remote service add home http://localhost:3000 none    # push to it
ipfs swarm peering add <an address dpm-server printed>         # fetch from it

# publish a package
mkdir base && cd base
dpm init
mkdir Kant && echo "duty : \X. good X => ought X;" > Kant/Ethics.ul
BASE=$(ipfs add -r -Q "$(dpm pack)")         # add it to your node
ipfs pin remote add --service=home $BASE      # push it: the server fetches it from your node

# depend on it
mkdir ../app && cd ../app
dpm init
dpm add $BASE
dpm install                                   # writes deps/<cid>/Kant/Ethics.ul and deps/graph.json (nothing pinned)
dpm tree $BASE | ipfs pin add                 # after checking it: keep it, and its whole tree, in your node
```

See [how DPM uses IPFS](docs/ipfs.md), the [protocol spec](docs/protocol.md), the [architecture](docs/architecture.md) (library, server policies), the [CLI reference](docs/cli.md) and the [engineering principles](docs/engineering.md).

## Library

```ts
import { Kubo, install } from '@team-affix/dpm';
import { createServer, commandPolicy, KuboAdmin } from '@team-affix/dpm/server';
import { pack, tree } from '@team-affix/dpm/client';
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
npm run test:e2e  # every user story, with real Kubo nodes, a dpm-server running unilog check, and real Unilog
                  # packages (needs ipfs, and unilog on the PATH or UNILOG_DIR=<a built unilog checkout>)
npm run lint
npm run build
npm run bundle    # single-file dpm and dpm-server in release/
```

Layout:

```
src/core     dpm.json, the read-only Kubo client, install
src/server   the Pinning Service API server with policies (dpm-server), its Kubo admin client, and the Pinning Service API client
src/client   pack / tree / install, client config, and the CLI (dpm)
test/        unit tests, end-to-end tests with real Kubo nodes and servers, and test/e2e/user-stories.sh (every user story, with Unilog)
docs/        protocol spec, architecture, CLI and philosophy
```
