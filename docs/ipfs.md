# How DPM uses IPFS

**DPM is a read-only interface to IPFS.** It reads packages by CID through a Kubo node, and never changes what any node keeps.

## The standard setup: Kubo running on your machine

This is how IPFS is normally used, and all DPM needs:

```bash
ipfs init --profile=unixfs-v1-2025   # once
ipfs daemon                           # leave it running
```

That's all. `dpm` and the `ipfs` command both talk to it automatically, at `http://127.0.0.1:5001`, with nothing to configure. (For a Kubo set up before, run `ipfs config profile apply unixfs-v1-2025` once. It makes everyone's nodes split files the same way, so the same files get the same CIDs and IPFS stores and transfers each one once.)

Kubo is the part that knows the network. When DPM asks for a CID, Kubo finds which nodes have it, fetches it from them, checks every block against its hash, and hands the content back. So DPM never needs to know where a package is stored.

## What DPM asks Kubo

DPM talks to Kubo over Kubo's HTTP API (Kubo calls it its "RPC API", but it's plain HTTP requests). It uses exactly four commands, all of them read-only:

| Command | What for |
|---|---|
| `/api/v0/cat` | read one file of a package: its `dpm.json` |
| `/api/v0/refs` | fetch a whole package, so every block of it is available |
| `/api/v0/get` | download a package's folder, as a tar stream that DPM unpacks into `deps/<cid>/` |
| `/api/v0/version` | show which Kubo `dpm node` is talking to |

That's everything `dpm install`, `dpm tree` and `dpm node` need. The `dpm` code contains no other request.

## Everything else is the `ipfs` command

The dividing line:

- **If a job works the same for any IPFS content, the `ipfs` command does it.** That covers adding, pinning, pushing to a server, connecting to other nodes, and getting a folder by CID.
- **If a job needs to know what a DPM package is, `dpm` does it.** That covers deciding which files make up a package (`dpm pack`), which CIDs make up its tree (`dpm tree`), installing a project's dependencies (`dpm install`), and editing `dpm.json`.

`dpm pack` writes the package to a folder on disk and doesn't touch IPFS at all. You add that folder with `ipfs add -r`.

Servers are separate: any IPFS pinning service (for example [unilog-server](https://github.com/team-affix/unilog-server)), which only Kubo talks to (`ipfs pin remote add`). See [protocol.md](protocol.md).

## Optional: a Kubo on another machine

Most users never need this. Since DPM only sends HTTP requests to a URL, it can also read through a Kubo on another machine: `dpm node set <url> <secret>`, or the `DPM_KUBO_API` and `DPM_KUBO_AUTH` environment variables. The `ipfs` command can do the same with `--api=<address> --api-auth=<secret>` on every command.

That Kubo's HTTP API allows every command by default, including deleting content and shutting the node down, so it must not be reachable from other machines as it is. Kubo can require a secret for every request, and limit each secret to particular commands (its `API.Authorizations` setting). For DPM, a secret allowed only the four commands above:

```bash
ipfs config --json API.Authorizations '{
  "admin": { "AuthSecret": "bearer:<a long random admin token>", "AllowedPaths": ["/api/v0"] },
  "dpm":   { "AuthSecret": "bearer:<a long random read token>",
             "AllowedPaths": ["/api/v0/cat", "/api/v0/refs", "/api/v0/get", "/api/v0/version"] }
}'
```

Once any secret is set, Kubo refuses every request without one. Put HTTPS (a reverse proxy) in front of Kubo when it's reached over the internet, so secrets aren't sent in the clear.

**Trust:** Kubo, not DPM, checks content against its CID, so whoever runs that Kubo decides what DPM receives. Use only a Kubo you trust.
