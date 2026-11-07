# Architecture

DPM has three parts with strictly separate jobs:

```
  push / pull / pack / install
              │
              ▼
┌──────────────────────────────┐
│ 0. hash check  ── decodeAs() │  bytes must hash to the claimed / requested ID
│ ingest()                     │  the only way packages should enter a registry
│   1. resolve()   ── Resolver │  full tree, overrides, peer conflicts, missing deps
│   2. verify()?   ── optional │  supplied by a layer above (e.g. logic validation)
│   3. put()       ── Registry │  dumb store: bytes in, bytes out, keyed by ID
└──────────────────────────────┘
```

The client and server share all of this (`src/core`). The server is an HTTP front end over a `Registry`. The client CLI keeps its own local `Registry` (`~/.dpm/client/registry` by default). A client and a server can share one registry directory if you want.

## Package format

All integers are u32 little-endian.

| Field | Encoding |
|---|---|
| magic | `DPM1` (4 bytes) |
| name | u32 length + UTF-8 |
| deps | u32 count, then each ID as u32 length + UTF-8, unique and sorted by UTF-8 bytes |
| payload | the rest of the bytes, opaque |

- **ID** = `<name>@<lowercase hex sha256 of the whole encoding>`.
- **Names** must be non-empty, at most 200 bytes, not `.`/`..`, and contain no whitespace, control characters or `@ / \ : * ? " < > |`. Names become directory names.
- **Canonical encoding** is enforced: `Package.decode` rejects any bytes that aren't the canonical encoding of their own contents.

## Hash verification

The first check on any bytes, before anything else is done with them. `Package.decodeAs(bytes, id)` decodes and throws `IdMismatchError` unless the content hashes to `id`. It runs everywhere bytes cross a trust boundary:

- **Push:** each pushed package carries its claimed ID, and the server checks every hash before resolving anything or contacting any provider. One mismatch rejects the whole push with 400.
- **Fetch from a remote:** the bytes must hash to the ID that was requested.
- **Read from disk:** the local registry re-checks each file against its filename, which catches corruption or tampering.
- **Any source in resolution:** a source returning a different package than requested is skipped, and the next source is tried.

## Registry

A directory: `<root>/packages/<id>`, where each file holds a package's bytes.

- `put(pkg)`: writes atomically (temp file + rename). Storing a package that's already present does nothing.
- `get(id)`: re-checks that the bytes hash to `id`, and reports corruption.
- `has(ids)`, `list()`.

It has no knowledge of dependencies, validity or policy.

## Resolution rules

`resolve(root, sources)` walks the dependency graph and fetches each package from the first source that returns bytes matching the ID.

1. **One package per name** in a resolved tree.
2. **Overrides.** A package's direct dependency named N replaces every N deeper in that package's subtree. The root also occupies its own name.
3. **Peer conflicts.** Two different N's meeting without a common ancestor overriding N is an error. The fix is to depend directly on the N you want from a common ancestor (usually the root).
4. **Overridden dependencies are never fetched.** The name is in the ID, so a resolver knows a dependency is overridden without downloading it. It doesn't matter whether anyone still hosts it.
5. **All missing dependencies are reported together**, each with the package that required it.

Subtrees are explored once per *override context*. A package reached by two paths with different overrides above it is checked under both, so whether a conflict is found never depends on traversal order.

The result lists every package in the resolved tree, dependencies before dependents.

## Ingest

`ingest(registry, batch, { sources, verify })`:

- Every package in the batch must resolve, using the registry, then the rest of the batch, then `sources`.
- Dependencies found in `sources` are used for resolution but **not stored**. A registry need not hold the full closure of what it stores.
- `verify(pkg, resolution)` runs after resolution and before anything is stored.
- All-or-nothing: if any package fails, nothing is stored.

## HTTP protocol

| Request | Response |
|---|---|
| `GET /health` | `{ "status": "ok" }` |
| `GET /packages` | `{ "ids": [...] }` |
| `GET /packages/:id` | raw package bytes, or 404 |
| `POST /packages/has` `{ "ids": [...] }` | `{ "ids": [...] }` (the subset present) |
| `POST /packages` `{ "packages": [{ "id", "data" }...], "providers": [url...] }` | `{ "ids": [...], "stored": [...] }` |

`POST /packages` first checks every package's hash against its claimed `id` (`data` is the base64 package bytes), then runs `ingest` with the provider URLs as remote sources. Errors are `{ "error": "..." }` with status 400 (malformed, or a hash mismatch), 413 (too large), 422 (doesn't resolve, or rejected by `verify`) or 404.

Server options: `verify`, `maxBodyBytes` (default 64 MiB), `allowProviders` (default true; `DPM_ALLOW_PROVIDERS=0` turns it off) and `maxProviders` (default 16). Fetching from providers means the server makes outbound requests to URLs chosen by whoever pushes. Turn providers off if that isn't acceptable for your deployment.

## Building a layer on top (e.g. DLPM)

```ts
import { Registry, unpackToDirectory } from '@team-affix/dpm';
import { createServer } from '@team-affix/dpm/server';

const server = createServer({
    registry: Registry.openOrCreate('/srv/dlpm'),
    async verify(pkg, resolution) {
        // unpack resolution.packages (and pkg) to a temp dir, run the logic checker, throw to reject
    },
});
server.listen(3000);
```

The same `verify` can be passed to `ingest()` and to `pull()` on the client, so clients check what they download, not just what servers accept.
