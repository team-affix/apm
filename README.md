# DPM: Distributed Package Manager

DPM is a thin layer over [IPFS](https://ipfs.tech) for packages that depend on each other by content.

- A **package is a folder**, and its **ID is the folder's IPFS CID**. There are no package names: the folder's contents, folder names included, are what it is.
- A package's `dpm.json` lists the packages it depends on, **by CID only**, never by location. Any IPFS node holding the content is as good a source as any other, and every block is checked against its CID.
- `dpm install` fetches the whole tree and lays it out **flat**, as `deps/<cid>/`, each package once. Since a CID fixes its entire dependency tree, there is nothing to resolve: DPM has no names, no overrides and no conflicts. What packages mean, and what to do when two of them clash, is left to the tools that use them.
- **Sharing is plain IPFS.** To keep a package online, push it to any IPFS pinning service with Kubo's own `ipfs pin remote add`. Pushing never uploads anything: you send the CID, and the service's IPFS node fetches it from yours. A service decides what it keeps: [unilog-server](https://github.com/team-affix/unilog-server) keeps only packages that check with Unilog.
- **`dpm` talks to one Kubo node**, normally the one running on your machine, and Kubo does all the networking. `dpm pack` adds your package to that node; everything else `dpm` does only reads. Pinning other packages, pushing to servers and connecting to them are done with the `ipfs` command. See [how DPM uses IPFS](docs/ipfs.md).

**DPM is a protocol** ([spec](docs/protocol.md)): the package format and the install rules. Everything else is IPFS. Checking content is the job of the content's own tools, and of whichever services choose to check before keeping.

DPM is the storage layer of a logic platform for public discourse (see [docs/philosophy](docs/philosophy/index.md)), but it knows nothing about logic and works for any kind of content.

## Install

Requires Node.js 20+ and [Kubo](https://github.com/ipfs/kubo/releases), the standard IPFS node (download the `kubo_<version>_<platform>` archive from its GitHub releases; `dist.ipfs.tech` no longer answers since its operator, Shipyard, wound down). Install the latest release of the npm package (run it again to upgrade); it provides `dpm`:

```bash
npm install -g https://github.com/team-affix/dpm/releases/latest/download/dpm.tgz
ipfs init                               # once
ipfs daemon                             # leave it running: dpm and the ipfs command both use it
```

## Quickstart

```bash
# a pinning service to share packages through, e.g. a unilog-server
ipfs pin remote service add home https://<service> <token>     # push to it
ipfs swarm peering add <the service node's address>            # fetch from it

# publish a package
mkdir base && cd base
dpm init
mkdir Kant && echo "duty : \X. good X => ought X;" > Kant/Ethics.ul
BASE=$(dpm pack)                              # add it to your node (pinned), and get its CID
ipfs pin remote add --service=home $BASE      # push it: the service fetches it from your node

# depend on it
mkdir ../app && cd ../app
dpm init
dpm dep add $BASE
dpm install                                   # writes deps/<cid>/Kant/Ethics.ul (nothing pinned)
dpm tree                                      # draw the installed tree
dpm tree --flat | ipfs pin add                # after checking it: keep everything installed, in your node
```

See [how DPM uses IPFS](docs/ipfs.md), the [protocol spec](docs/protocol.md), the [architecture](docs/architecture.md), the [CLI reference](docs/cli.md) and the [engineering principles](docs/engineering.md).

## Library

```ts
import { Kubo, install } from '@team-affix/dpm';
import { pack, tree } from '@team-affix/dpm/client';
```

## Releases

Built files are never committed. They are attached to [GitHub Releases](https://github.com/team-affix/dpm/releases) by CI:

| File | What it is |
|---|---|
| `dpm-<version>.cjs` | the client as a single file: `node dpm-<version>.cjs install` |
| `team-affix-dpm-<version>.tgz` | the npm package (the command and the library): `npm i -g ./team-affix-dpm-<version>.tgz` |

Each release also has the same files without the version in their names (`dpm.cjs`, `dpm.tgz`), so `https://github.com/team-affix/dpm/releases/latest/download/<name>` always gets the newest.

To release: set a new version in `package.json` and merge to `main`. After the tests pass, CI tags the merge commit `v<version>` and publishes the release. Merges that don't change the version publish nothing. (Pushing a matching `v*` tag by hand also releases.)

## Development

```bash
npm ci
npm test          # vitest; the end-to-end tests run real Kubo nodes (IPFS_BIN or ipfs on the PATH), skipped without one
npm run lint
npm run build
npm run bundle    # single-file dpm in release/
```

Layout:

```
src/core     dpm.json, the Kubo client, install
src/client   pack / tree / install, client config, and the CLI (dpm)
test/        unit tests, and end-to-end tests with real Kubo nodes

The end-to-end test of every user story (DPM, Kubo, Unilog and a server together) lives in [unilog-server](https://github.com/team-affix/unilog-server): `npm run test:e2e` there.
docs/        protocol spec, architecture, CLI and philosophy
```
