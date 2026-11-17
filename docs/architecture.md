# Architecture

DPM is a thin layer over IPFS. It has three parts:

1. **The protocol** ([protocol.md](protocol.md)): packages are IPFS folders with a `dpm.json` of dependency CIDs, installed flat into `deps/<cid>/`. Sharing them is plain IPFS.
2. **A library** (`@team-affix/dpm`) for reading packages from IPFS and installing them.
3. **The `dpm` command.**

```
 your machine                                      anywhere: other users, pinning services
 ┌──────────────┐  HTTP (private)  ┌──────┐         ┌──────┐
 │ dpm          │ ───────────────▶ │ Kubo │ ◀─────▶ │ Kubo │ ...
 └──────────────┘  pack (add),      └──────┘  IPFS   └──────┘
                   otherwise reads    ▲      (content, hash-checked)
 ┌──────────────┐                     │
 │ ipfs command │ ────────────────────┘
 └──────────────┘  pin, push to a pinning service
```

`dpm` and the `ipfs` command both talk to the user's Kubo node through its private HTTP API. Content moves only between Kubo nodes, over IPFS, checked block by block against its CID.

**`dpm` talks to one Kubo node, and Kubo does all the networking.** That node is normally the one running on the user's machine. `dpm` uses five of its commands: `add` for `dpm pack`, and four that only read ([ipfs.md](ipfs.md) has the details). The dividing line: anything that works the same for any IPFS content is done by Kubo's `ipfs` command (pinning other packages, pushing to a server, connecting to a server's node, getting a folder by CID). Anything that needs to know what a DPM package is, is done by `dpm`: adding a package with exactly the files that make it up (`dpm pack`), which CIDs make up its tree (`dpm package tree`), installing a project's dependencies (`dpm install`), and editing `dpm.json`.

## What DPM does, and what it leaves to others

- **IPFS** stores, transfers and verifies content, and gives each folder its CID.
- **DPM** says how a package lists its dependencies (`dpm.json`) and how a tree is installed (`deps/<cid>/`).
- **The content's own tools** decide what packages mean, and what to do when two of them clash. For example, a Unilog project can use `"roots": [".", "deps/*"]`, and Unilog reports two packages providing the same module.
- **Services** decide what to keep. Any IPFS pinning service works; [unilog-server](https://github.com/team-affix/unilog-server) keeps only packages that check with Unilog. It uses this library to fetch a package's tree.

DPM has no package names, so it has no name conflicts, no overrides and no resolver. A CID fixes its whole dependency tree.

## Library (`@team-affix/dpm`)

| Part | What it does |
|---|---|
| `Kubo` | A client for a Kubo node's HTTP API, on this machine or another: `addFolder` (Kubo's `add`, with fixed import settings), `cat`, `fetch` (Kubo's `refs`), `exportTo` (Kubo's `get`) and `version`. Nothing else. |
| `readPackageFolder` | A project folder's files, leaving out `deps/` and hidden entries |
| `manifest`, `parseManifest`, `readManifest`, `writeManifest`, `isCid` | `dpm.json` |
| `fetchTree`, `install`, `readInstalled` | Fetch a tree by CID (each package once), install it flat, and read the installed tree back from the `dpm.json` files |

`@team-affix/dpm/client` has `pack`, `tree` and `ClientConfig`.

The `Kubo` client can only read. A program that needs more of Kubo's API (e.g. a server pinning what it accepts, like unilog-server) extends it with a subclass of its own: `call` and `json` are protected for that.
