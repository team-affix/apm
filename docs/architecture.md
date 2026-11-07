# Architecture

This repository holds three things:

1. **The protocol** ([protocol.md](protocol.md)). This is what DPM *is*.
2. **A library** of parts for building protocol clients and servers.
3. **Reference implementations** built from those parts: the `dpm` CLI and `dpm-server`.

There is one client, `dpm`, for every kind of content and every server. Servers with a different acceptance policy (e.g. a logic server that only accepts logically valid packages) are written from the same library and speak the same protocol. There are no hooks into the reference implementations. If a server needs different behaviour, it writes its own handler, the way GitHub runs its own push server while still speaking Git's protocol.

## Validation happens outside DPM

DPM moves bytes and guarantees they are exactly what was asked for (every fetch is hash-checked). It never judges content, and it never runs commands. Checking content is a separate, second step done by the content's own tool:

```bash
dpm add Kant@<sha256>      # depend on it
dpm install                # fetch (hash-checked), resolve, unpack into deps/
logic-check .              # your language's checker reads MyProject/ + deps/
```

Validity belongs to a resolved project tree, not to a stored package (overrides change what a dependency means), so a project is the natural unit to check. A local registry is just a cache of hash-verified bytes and can hold any kind of content.

## Library (`@team-affix/dpm`)

| Part | What it does |
|---|---|
| `Package` | Encode/decode the package format. `Package.decodeAs(bytes, id)` is the mandatory hash check. A `Package` can only be obtained by decoding or creating one, so its `id` is always the hash of its bytes. |
| `parseId`, `nameOf`, `assertValidName` | Identity rules |
| `Registry` | A plain on-disk store: `<root>/packages/<id>`. Atomic `put` (a no-op if already present), and `get` re-checks the hash. No policy and no knowledge of dependencies. |
| `PackageSource`, `MemorySource`, `CachingSource`, `fetchVerified` | Anywhere packages can come from, in priority order, with every result hash-checked |
| `resolve`, `formatTree` | The resolution rules |
| `ingest`, `dependenciesFirst` | The reference admission sequence (resolve every package in the batch, then store them all, or none). A convenience, not a contract. |
| `RemoteRegistry` | Protocol client: `health`, `list`, `has`, `get`, `push`. Also usable as a `PackageSource`. |
| `packDirectory`, `unpackToDirectory` | Deterministic directory ↔ payload conversion, and safe extraction of untrusted payloads |

### Server parts (`@team-affix/dpm/server`)

`matchRoute`, `readJson`, `parseHasRequest`, `parsePushRequest` (which performs the hash check), `sendJson`, `sendPackage`, `sendError`, `statusFor`, `handle`, `HttpError`.

### Client parts (`@team-affix/dpm/client`)

`Project` (manifest, `install`, `pack`), `pull`, `push`, and `ClientHome` (an app's state directory: its local registry and remotes).

## Reference implementations

**`dpm-server`** accepts a push if every package passes the hash check and resolves, looking dependencies up in its own registry, the pushed batch and the given providers (`ingest`). It doesn't store what it fetched from providers. Options: `maxBodyBytes` (default 64 MiB), `allowProviders` (default true; `DPM_ALLOW_PROVIDERS=0` turns it off) and `maxProviders` (default 16). Turn providers off if you don't want the server making outbound requests to URLs chosen by pushers.

**`dpm`** keeps its state in `~/.dpm/client` (`ClientHome`): one local registry for all content.

## Writing a server with a different policy

`src/server/server.ts` is the reference assembly, about 60 lines. A server with its own policy writes its own handler from the same parts and controls the whole push sequence:

```ts
import http from 'http';
import { Registry, RemoteRegistry, resolve } from '@team-affix/dpm';
import { handle, matchRoute, parsePushRequest, readJson, sendJson /* ... */ } from '@team-affix/dpm/server';

http.createServer(handle(async (req, res) => {
    const route = matchRoute(req);
    if (route?.kind === 'push') {
        const { packages, providers } = parsePushRequest(await readJson(req, LIMIT)); // 1. hash check
        const resolutions = await Promise.all(packages.map((p) => resolve(p, sources))); // 2. resolve
        await checkLogic(packages, resolutions);           // 3. this server's policy (throw RejectedError → 422)
        for (const p of packages) await registry.put(p);   // 4. store
        return sendJson(res, 200, { ids, stored });
    }
    // ...the other routes, usually identical to the reference server
}));
```

`test/custom-server.test.ts` contains a complete working example. It checks a whole batch at once, rejects by policy with 422, and works with the standard client and the reference server.
