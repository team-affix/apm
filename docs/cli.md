# CLI reference

`dpm` does package management and **only reads from IPFS**: it never adds, pins or deletes anything in any node. Every change to what a node keeps is made with the `ipfs` command (Kubo):

| To | Run |
|---|---|
| add your project to your node | `ipfs add -r -Q "$(dpm pack)"` |
| pin a package in your node | `ipfs pin add <cid>` |
| pin a package and its whole tree | `dpm tree <cid> \| xargs -n1 ipfs pin add` |
| register a DPM server, once | `ipfs pin remote service add <server> <url> <token>` (any token if the server needs none) |
| push a package to a server | `ipfs pin remote add --service=<server> <cid>` |
| push a package and its whole tree | `dpm tree <cid> \| xargs -n1 ipfs pin remote add --service=<server>` |

`dpm` talks to your local node through its RPC API: `http://127.0.0.1:5001` by default, set with `dpm node --set <url>` or `DPM_KUBO_API`. Settings and remotes are in `~/.dpm/client/config.json` (override the folder with `DPM_HOME`).

Start the node first: `ipfs init --profile=unixfs-v1-2025` (once), then `ipfs daemon`. For an existing node, `ipfs config profile apply unixfs-v1-2025`. The profile makes `ipfs add` give the same CID as `dpm cid`.

## Projects

A project is a folder with a `dpm.json` (`{ "deps": [CID, ...] }`); the folder is a DPM package because it has one. Installed dependencies go in `deps/<cid>/`, with `deps/graph.json`. Project commands work on the current directory, or the one given with `-C <dir>`.

| Command | Description |
|---|---|
| `dpm init` | Create `dpm.json` |
| `dpm add <cid...>` | Add direct dependencies to `dpm.json` |
| `dpm remove <cid...>` | Remove direct dependencies from `dpm.json` |
| `dpm install [-r <remote...>] [--timeout 120s]` | Fetch every dependency into `deps/<cid>/` and write `deps/graph.json`. Remotes are asked whether they keep each package, and the nodes of those that do are connected to first. Nothing is pinned: fetched packages are cached like anything your node downloads. |
| `dpm ls` | List the project's installed packages: `*` marks direct dependencies, followed by each package's top-level folders |
| `dpm pack` | Write the project's package (everything except `deps/` and hidden files) to a new temporary folder, and print the folder's path. The CID it will have once added is printed on stderr. |
| `dpm cid` | Print the project's CID, without storing anything |

## Packages

These take a CID and work anywhere: no project needed.

| Command | Description |
|---|---|
| `dpm tree <cid> [--timeout 120s]` | Print the package and every package it depends on, recursively, one CID per line, each once. Everything is fetched (not pinned) before anything is printed, so if the tree can't be completed, nothing is printed. |
| `dpm ls --node` | List every DPM package pinned in your node: its pinned folders that contain a `dpm.json` |
| `dpm ls --remote <name>` | List every DPM package a remote DPM server keeps. The same request as for your node, sent to the server. |
| `dpm status <cid> [-r <remote...>]` | Show what each remote decided about a package you pushed: `pinned`, `failed` with the server's reason, or no request. (`ipfs pin remote add` reports a refusal, but not why.) |

Install, check, then pin:

```bash
dpm install                               # fetch into deps/, nothing pinned
unilog check                              # decide
dpm tree <cid> | xargs -n1 ipfs pin add   # keep what you checked, with its whole tree
```

## Remotes

Remotes are DPM servers `dpm` reads from: when installing, and for `dpm ls --remote` and `dpm status`. Pushing to a server is done by Kubo, which has its own list (`ipfs pin remote service add`).

| Command | Description |
|---|---|
| `dpm remote add <name> <url>` | Add a DPM server |
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
