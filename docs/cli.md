# CLI reference

`dpm` does package management through the Kubo node running on your machine ([how DPM uses IPFS](ipfs.md)). `dpm pack` creates your package and adds it there; everything else `dpm` does only reads. The rest is done with the `ipfs` command:

| To | Run |
|---|---|
| create your project's package, add it to your node, and get its CID | `dpm pack` |
| pin a package in your node | `ipfs pin add <cid>` |
| pin a package and its whole tree | `dpm package tree <cid> --flat \| ipfs pin add` |
| pin everything your project installed | `dpm tree --flat \| ipfs pin add` |
| register a pinning service, once | `ipfs pin remote service add <server> <url> <token>` (any token if the service needs none) |
| push a package to a server | `ipfs pin remote add --service=<server> <cid>` (your project: `ipfs pin remote add --service=<server> "$(dpm pack)"`) |
| push a package and its whole tree | push each CID `dpm package tree <cid> --flat` prints (bash: `dpm package tree <cid> --flat \| xargs -n1 ipfs pin remote add --service=<server>`; PowerShell: `dpm package tree <cid> --flat \| % { ipfs pin remote add --service=<server> $_ }`) |
| fetch from a server | `ipfs swarm peering add <the server node's address>` (see below) |
| get a package's files to work on | `ipfs get <cid> -o <folder>`, then `dpm install` in it |

**Setup:** run Kubo on your machine, the standard way to use IPFS: `ipfs init` once, then `ipfs daemon`, left running. `dpm` and the `ipfs` command both talk to it automatically (at `http://127.0.0.1:5001`), with nothing to configure.

Kubo does all the work of finding, fetching and verifying content; `dpm` only asks it for packages by CID. (Reading through a Kubo on another machine is possible too, but optional: see [ipfs.md](ipfs.md).) Settings are in `~/.dpm/client/config.json` (override the folder with `DPM_HOME`).

## Commands

Commands are grouped by what they act on:

- **`dpm project <command>`**: the project in the current directory, or the one given with `-C <dir>`. A project is a folder with a `dpm.json` (`{ "deps": [CID, ...] }`); the folder is a DPM package because it has one. Installed dependencies go in `deps/<cid>/`, each with its own `dpm.json`.
- **`dpm project dep <command>`**: the project's direct dependencies, the CIDs listed in its `dpm.json`.
- **`dpm package <command>`**: a package, by CID, read through Kubo. No project needed.
- **`dpm node <command>`**: which Kubo `dpm` talks to.

Every `dpm project` command has a shorthand without `project`: `dpm install` is `dpm project install`, `dpm tree` is `dpm project tree`, and `dpm dep` is `dpm project dep`, with all its subcommands (`dpm dep add`).

| Command | Shorthand | Description |
|---|---|---|
| `dpm project init` | `dpm init` | Create `dpm.json` |
| `dpm project install [--timeout 120s]` | `dpm install` | Fetch every dependency into `deps/<cid>/`. Your node fetches each package from whichever node has it. Nothing is pinned: fetched packages are cached like anything your node downloads. |
| `dpm project clean` | `dpm clean` | Delete the project's `deps/` folder: everything `dpm install` wrote. Nothing in IPFS is touched, and `dpm install` brings it all back. Refuses a folder without `dpm.json`. |
| `dpm project pack` | `dpm pack` | Create the project's package (the project folder without `deps/` and hidden files), add it to your Kubo (pinned), and print its CID. The same files always get the same CID, whatever your Kubo's settings. |
| `dpm project dep add <cid...>` | `dpm dep add` | Add direct dependencies to `dpm.json` |
| `dpm project dep rm <cid...>` | `dpm dep rm` | Remove direct dependencies from `dpm.json` |
| `dpm project dep ls` | `dpm dep ls` | List the direct dependencies only, one CID per line, from `dpm.json`. Needs no install and no Kubo. |
| `dpm project tree [--flat]` | `dpm tree` | Draw the installed dependency tree, read from the `dpm.json` files in `deps/`. With `--flat`: every installed package once, one CID per line, for piping. |
| `dpm package tree <cid> [--flat] [--timeout 120s]` | | Draw the package and every package it depends on, recursively, fetched through Kubo (not pinned). With `--flat`: each once, one CID per line, for piping. Everything is fetched before anything is printed, so if the tree can't be completed, nothing is printed. |

A tree is drawn as boxes: each package is a box with its CID, and its dependencies hang below it. A package that several others depend on appears under each of them.

```
┌─────────────────────────────────────────────────────────────┐
│ bafybeietunizbhpwaf3y2llcacajs3lisma6sohfrnogazxaoujoardzry │
└─────────────────────────────────────────────────────────────┘
└───┌─────────────────────────────────────────────────────────────┐
    │ bafybeicchijp4mabfu5yx46xznjtwcsnbj6ofbfx7x4udjpj35w47pl72a │
    └─────────────────────────────────────────────────────────────┘
```

(To see what your own node has pinned, use `ipfs pin ls`.)

Install, check, then pin:

```bash
dpm install                               # fetch into deps/, nothing pinned
unilog check                              # decide
dpm tree --flat | ipfs pin add            # keep what you checked: everything installed
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
