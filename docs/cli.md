# CLI reference

`dpm` does package management. It's a **read-only interface to IPFS**: it reads packages through the Kubo node running on your machine, and never adds, pins or deletes anything. Everything else is done with the `ipfs` command ([how DPM uses IPFS](ipfs.md)):

| To | Run |
|---|---|
| add your project to your node | `ipfs add -r -Q "$(dpm pack)"` |
| pin a package in your node | `ipfs pin add <cid>` |
| pin a package and its whole tree | `dpm tree <cid> \| ipfs pin add` |
| register a pinning service, once | `ipfs pin remote service add <server> <url> <token>` (any token if the service needs none) |
| push a package to a server | `ipfs pin remote add --service=<server> <cid>` |
| push a package and its whole tree | push each CID `dpm tree <cid>` prints (bash: `dpm tree <cid> \| xargs -n1 ipfs pin remote add --service=<server>`; PowerShell: `dpm tree <cid> \| % { ipfs pin remote add --service=<server> $_ }`) |
| fetch from a server | `ipfs swarm peering add <the server node's address>` (see below) |
| get a package's files to work on | `ipfs get <cid> -o <folder>`, then `dpm install` in it |

**Setup:** run Kubo on your machine, the standard way to use IPFS: `ipfs init --profile=unixfs-v1-2025` once, then `ipfs daemon`, left running. `dpm` and the `ipfs` command both talk to it automatically (at `http://127.0.0.1:5001`), with nothing to configure. For a Kubo set up before, run `ipfs config profile apply unixfs-v1-2025` once.

Kubo does all the work of finding, fetching and verifying content; `dpm` only asks it for packages by CID. (Reading through a Kubo on another machine is possible too, but optional: see [ipfs.md](ipfs.md).) Settings are in `~/.dpm/client/config.json` (override the folder with `DPM_HOME`).

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

This takes a CID and works anywhere: no project needed. (To see what your own node has pinned, use `ipfs pin ls`.)

| Command | Description |
|---|---|
| `dpm tree <cid> [--timeout 120s]` | Print the package and every package it depends on, recursively, one CID per line, each once. Everything is fetched (not pinned) before anything is printed, so if the tree can't be completed, nothing is printed. |

Install, check, then pin:

```bash
dpm install                               # fetch into deps/, nothing pinned
unilog check                              # decide
dpm tree <cid> | ipfs pin add             # keep what you checked, with its whole tree
```

## Servers

A server here is any IPFS pinning service, such as [unilog-server](https://github.com/team-affix/unilog-server), which keeps only packages that check with Unilog. Kubo talks to it; `dpm` never does.

- **Pushing:** register the service once with `ipfs pin remote service add <name> <url> <token>` (any token if the service needs none), then `ipfs pin remote add --service=<name> <cid>`. If the service refuses, the command fails with "remote service failed to pin". You can try another one.
- **Fetching:** your node needs to reach the service's node. `ipfs swarm peering add <address>` connects now and keeps the connection up until Kubo restarts; to keep it permanently, add the service's node to `Peering.Peers` in Kubo's config. Without peering, Kubo can still find packages on the public IPFS network, more slowly.

## Node

| Command | Description |
|---|---|
| `dpm node` (or `dpm node show`) | Show which Kubo `dpm` talks to: its URL and version |
| `dpm node set <url> [secret]` | Use the Kubo at `<url>`, with its secret if it requires one (`bearer:<token>` or `basic:<user>:<password>`, as Kubo writes them) |
| `dpm node reset` | Go back to the default: the Kubo running on this machine, `http://127.0.0.1:5001` |
