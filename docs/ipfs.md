# How DPM uses IPFS

**DPM is a read-only interface to IPFS.** It reads packages by CID, through one Kubo node. It never changes what any node keeps, and it doesn't care where that node is: on your machine, or on another one.

## One node, anywhere

DPM talks to a single Kubo node over HTTP, through Kubo's HTTP API. Kubo calls it its "RPC API", but it's plain HTTP requests, nothing more. To DPM, that node stands for the whole IPFS network. When DPM asks for a CID, Kubo finds which nodes have it, fetches it from them, checks every block against its hash, and hands the content back. So DPM never needs to know where a package is stored.

Since it's only HTTP, the node can be anywhere:

- **On your machine** (the default): `http://127.0.0.1:5001`.
- **On another machine:** `dpm node --set <url> --auth <secret>`, or the `DPM_KUBO_API` and `DPM_KUBO_AUTH` environment variables.

## What DPM asks Kubo

DPM uses exactly four of Kubo's commands, all of them read-only:

| Command | What for |
|---|---|
| `/api/v0/cat` | read one file of a package: its `dpm.json` |
| `/api/v0/refs` | fetch a whole package, so every block of it is available |
| `/api/v0/get` | download a package's folder, as a tar stream that DPM unpacks into `deps/<cid>/` |
| `/api/v0/version` | show which Kubo `dpm node` is talking to |

That's everything `dpm install`, `dpm tree` and `dpm node` need. Nothing DPM does needs Kubo's admin commands.

## Reaching a node on another machine safely

By default, Kubo's HTTP API allows every command, including deleting content, changing settings and shutting the node down. So it must never be reachable from other machines as it is.

Kubo can require a secret for every request, and limit each secret to particular commands (its `API.Authorizations` setting). Give DPM a secret allowed only the four commands above:

```bash
ipfs config --json API.Authorizations '{
  "admin": { "AuthSecret": "bearer:<a long random admin token>", "AllowedPaths": ["/api/v0"] },
  "dpm":   { "AuthSecret": "bearer:<a long random read token>",
             "AllowedPaths": ["/api/v0/cat", "/api/v0/refs", "/api/v0/get", "/api/v0/version"] }
}'
```

Then, on the machine running `dpm`:

```bash
dpm node --set http://<host>:5001 --auth bearer:<the read token>
```

Once any secret is set, Kubo refuses every request without one, so the `ipfs` command needs the admin secret too (`ipfs --api-auth=bearer:<admin token> ...`). With the read token, every other command is refused. The tests check this against a real Kubo.

Use HTTPS (a reverse proxy in front of Kubo) when the node is reached over the internet, so the token isn't sent in the clear.

## Trust

DPM doesn't check content against its CID itself: Kubo does. So whoever runs the node decides what DPM receives. A node on your own machine, or on a server you control, is as trustworthy as you are. A node someone else runs could hand you different content for a CID without DPM noticing. **Point DPM only at a Kubo node you trust.**

## Everything else is the `ipfs` command

The dividing line:

- **If a job works the same for any IPFS content, the `ipfs` command does it.** That covers adding, pinning, pushing to a server, connecting to other nodes, and getting a folder by CID.
- **If a job needs to know what a DPM package is, `dpm` does it.** That covers deciding which files make up a package (`dpm pack`), which CIDs make up its tree (`dpm tree`), installing a project's dependencies (`dpm install`), and editing `dpm.json`.

`dpm pack` writes the package to a folder on disk and doesn't touch IPFS at all. You add that folder with `ipfs add -r`.

A DPM server is a separate thing: a standard IPFS pinning service with its own Kubo node, which only Kubo talks to (`ipfs pin remote add`). See [protocol.md](protocol.md).
