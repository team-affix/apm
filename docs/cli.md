# CLI reference

`dpm` drives your local IPFS node (Kubo) through its RPC API: `http://127.0.0.1:5001` by default, set with `dpm node --set <url>` or `DPM_KUBO_API`. Settings and remotes are in `~/.dpm/client/config.json` (override the folder with `DPM_HOME`). Packages themselves live in the IPFS node.

Start the node first: `ipfs init --profile=unixfs-v1-2025` (once), then `ipfs daemon`.

## Projects

A project is a folder with a `dpm.json` (`{ "deps": [CID, ...] }`). Installed dependencies go in `deps/<cid>/`, with `deps/graph.json`. All commands work on the current directory, or the one given with `-C <dir>`.

| Command | Description |
|---|---|
| `dpm init` | Create `dpm.json` |
| `dpm add <cid...>` | Add direct dependencies |
| `dpm remove <cid...>` | Remove direct dependencies |
| `dpm install [-r <remote...>] [--timeout 120s]` | Fetch every dependency into `deps/<cid>/` and write `deps/graph.json`. Remotes are asked whether they keep each package, and the nodes of those that do are connected to first. Nothing is pinned: fetched packages are cached like anything your node downloads. |
| `dpm ls` | List the project's installed packages: `*` marks direct dependencies, followed by each package's top-level folders |
| `dpm ls --node` | List every package in the local IPFS node: the pins DPM created (named `dpm`), not other applications' content |
| `dpm ls --remote <name>` | List every package a remote DPM server keeps. The same request as `--node`, sent to the server. |
| `dpm cid` | Print the project's CID, without storing anything |
| `dpm pack` | Add the project to the local node (leaving out `deps/` and hidden files) and print its CID |
| `dpm push [remote...] [--cid <cid>] [--with-deps] [--wait 120]` | Pack the project (or take a CID) and ask remotes to keep it. Nothing is uploaded: each remote's node fetches it from yours. Servers usually keep only what is pushed, so `--with-deps` also pushes each package it depends on, as its own request. Prints each remote's verdict, with the reason if it refused. |

## Pinning

| Command | Description |
|---|---|
| `dpm pin <cid...> [--timeout 120s]` | Pin packages and their whole trees (every package their `dpm.json` files name), so your node keeps them. The whole tree is fetched first and pinned only if all of it arrived. Works anywhere: no project needed. (`ipfs pin add <cid>` would pin only the package's own folder, not its dependencies.) |

Install, check, then pin:

```bash
dpm install        # fetch into deps/, nothing pinned
unilog check       # decide
dpm pin <cid>      # keep what you checked
```

## Remotes

| Command | Description |
|---|---|
| `dpm remote add <name> <url> [--token <token>]` | Add a DPM server (any IPFS pinning service works) |
| `dpm remote remove <name>` | Remove one |
| `dpm remote ls` | List them |
| `dpm node [--set <url>]` | Show the local node (version, peer ID, addresses), or set its RPC API URL |

## Server

```bash
DPM_KUBO_API=http://127.0.0.1:5001 PORT=3000 dpm-server
```

| Variable | Meaning |
|---|---|
| `PORT`, `HOST` | Where to listen (default 3000, all interfaces) |
| `DPM_KUBO_API` | The server's Kubo RPC API. Keep it private. |
| `DPM_DATA` | Where pin requests are stored (default `~/.dpm/server`) |
| `DPM_TOKENS` | Comma-separated access tokens. If set, adding or withdrawing pins needs one. |
| `DPM_ANNOUNCE` | Comma-separated multiaddrs clients should connect to (default: the node's own) |
| `DPM_CHECK` | A command run in each installed package; it is kept only if the command succeeds. A Unilog server uses `unilog check`. |
| `DPM_KEEP_DEPS` | `1`: pin each package's dependencies too. By default only what was pushed is pinned; dependencies are fetched for the check without being pinned, so they stay only as cached data until garbage collection, as with anything a Kubo node fetches. |

Expose the server's port and the Kubo node's peer-to-peer port (4001), never its RPC API (5001). Give the server a Kubo node of its own: after refusing or releasing a package, the server garbage-collects the node so it stops serving that content, which deletes anything unpinned.
