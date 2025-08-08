# Server

The APM server is a minimal Express + tRPC application that exposes registry operations over HTTP.

- Binary: `apm-server`
- Default port: `3000` (override with `PORT` environment variable)
- Health endpoint: `GET /health` → `{ status: 'ok', timestamp: <ISO> }`
- tRPC endpoint: `/api/trpc`

## Running

```bash
apm-server
# PORT=4000 apm-server
```

## API (tRPC procedures)

Mounted under `/api/trpc`:

- `getPullDependencies({ rootId }) -> { pkgIds: string[] }`
  - Returns a topologically sorted list of package IDs for the full dependency tree of `rootId`.
- `get({ id }) -> { b64 }`
  - Returns a base64 string of the package file bytes.
- `ls({ ids }) -> { ids }`
  - Returns the intersection of provided IDs and those present on the server.
- `put({ id, b64 }) -> { id }`
  - Registers the package represented by base64 bytes, vetting it before storing under `packages/<id>`.

See `docs/cli.md` for client commands that call these procedures.
