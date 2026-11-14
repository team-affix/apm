# CLI reference

`dpm` does package management. It **talks only to your local IPFS node (Kubo), and only reads from it**: it never adds, pins or deletes anything, and never contacts other machines. Kubo does all of that, through the `ipfs` command:

| To | Run |
|---|---|
| add your project to your node | `ipfs add -r -Q "$(dpm pack)"` |
| pin a package in your node | `ipfs pin add <cid>` |
| pin a package and its whole tree | `dpm tree <cid> \| ipfs pin add` |
| register a DPM server, once | `ipfs pin remote service add <server> <url> <token>` (any token if the server needs none) |
| push a package to a server | `ipfs pin remote add --service=<server> <cid>` |
| push a package and its whole tree | push each CID `dpm tree <cid>` prints (bash: `dpm tree <cid> \| xargs -n1 ipfs pin remote add --service=<server>`; PowerShell: `dpm tree <cid> \| % { ipfs pin remote add --service=<server> $_ }`) |
| fetch from a server | `ipfs swarm peering add <the server node's address>` (see below) |
| get a package's files to work on | `ipfs get <cid> -o <folder>`, then `dpm install` in it |

`dpm` talks to your local node through its RPC API: `http://127.0.0.1:5001` by default, set with `dpm node --set <url>` or `DPM_KUBO_API`. Settings are in `~/.dpm/client/config.json` (override the folder with `DPM_HOME`).

Start the node first: `ipfs init --profile=unixfs-v1-2025` (once), then `ipfs daemon`. For an existing node, `ipfs config profile apply unixfs-v1-2025`. Everyone using the same import settings means the same files get the same CIDs, so IPFS stores and transfers each file once.

## Projects

A project is a folder with a `dpm.json` (`{ "deps": [CID, ...] }`); the folder is a DPM package because it has one. Installed dependencies go in `deps/<cid>/`, with `deps/graph.json`. Project commands work on the current directory, or the one given with `-C <dir>`.

| Command | Description |
|---|---|
| `dpm init` | Create `dpm.json` |
| `dpm add <cid...>` | Add direct dependencies to `dpm.json` |
| `dpm remove <cid...>` | Remove direct dependencies from `dpm.json` |
| `dpm install [--timeout 120s]` | Fetch every dependency into `deps/<cid>/` and write `deps/graph.json`. Your node fetches each package from whichever node has it. Nothing is pinned: fetched packages are cached like anything your node downloads. |
| `dpm ls` | List the project's installed packages: `*` marks direct dependencies, followed by each package's top-level folders |
| `dpm pack [-o <folder>]` | Write the project's package (everything except `deps/` and hidden files) to a new folder, and print the folder's path. Without `-o`, it is a temporary folder named by a random GUID; with `-o`, the folder must not exist yet. The folder is the package, to be added with `ipfs add -r` as it is, not edited. `pack` doesn't touch IPFS. |

## Packages

These take a CID and work anywhere: no project needed.

| Command | Description |
|---|---|
| `dpm tree <cid> [--timeout 120s]` | Print the package and every package it depends on, recursively, one CID per line, each once. Everything is fetched (not pinned) before anything is printed, so if the tree can't be completed, nothing is printed. |
| `dpm ls --node` | List every DPM package pinned in your node: its pinned folders that contain a `dpm.json` |

Install, check, then pin:

```bash
dpm install                               # fetch into deps/, nothing pinned
unilog check                              # decide
dpm tree <cid> | ipfs pin add             # keep what you checked, with its whole tree
```

## Servers

A DPM server is a standard IPFS pinning service. Kubo talks to it; `dpm` never does.

- **Pushing:** register the server once with `ipfs pin remote service add <name> <url> <token>` (any token if the server needs none), then `ipfs pin remote add --service=<name> <cid>`. If the server refuses, the command fails with "remote service failed to pin". You can try another server.
- **Fetching:** To fetch from a server, your node needs to reach the server's node. `ipfs swarm peering add <address>` connects now and keeps the connection up until Kubo restarts; to keep it permanently, add the server to `Peering.Peers` in Kubo's config. `dpm-server` prints its node's addresses when it starts. Without peering, Kubo can still find packages on the public IPFS network, more slowly.

## Node

| Command | Description |
|---|---|
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
| `DPM_ANNOUNCE` | Comma-separated multiaddrs of the server's node, for clients to peer with (default: the node's own) |
| `DPM_CHECK` | A command run in each installed package; it is kept only if the command succeeds. A Unilog server uses `unilog check`. |
| `DPM_KEEP_DEPS` | `1`: pin each package's dependencies too. By default only what was pushed is pinned; dependencies are fetched for the check without being pinned, so they stay only as cached data until garbage collection, as with anything a Kubo node fetches. |

Expose the server's port and the Kubo node's peer-to-peer port (4001), never its RPC API (5001). Give the server a Kubo node of its own: after refusing or releasing a package, the server garbage-collects the node so it stops serving that content, which deletes anything unpinned.
