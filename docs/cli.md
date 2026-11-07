# CLI reference

This is the reference client. State lives in `~/.dpm/client` (override with `DPM_HOME`): the local registry is `<home>/registry`, and remotes are in `<home>/remotes.json`, where their order is the lookup priority. Other protocol clients (e.g. `dlpm`) keep their own state directory and registry.

## Projects

A project directory contains `dpm.json` (`{ "name", "deps" }`), the content in `<Name>/`, and installed dependencies in `deps/<Dep>/`.

| Command | Description |
|---|---|
| `dpm init <name>` | Create `dpm.json` and `<name>/` |
| `dpm add <id...>` | Add direct dependencies. An existing dependency with the same name is replaced; that's how you pick a version or override a transitive one. |
| `dpm remove <id-or-name...>` | Remove direct dependencies |
| `dpm install [-r <remote...>] [--offline]` | Resolve the tree, keep a local copy of anything fetched, and write `deps/<name>/` |
| `dpm pack [-r <remote...>] [--offline]` | Build a package from `<Name>/` and `dpm.json`, store it locally, and print its ID |

## Packages

| Command | Description |
|---|---|
| `dpm ls [ids...] [-r <remote>]` | List all packages, or show which of the given IDs are present |
| `dpm info <id>` | Show a local package |
| `dpm tree <id> [-r <remote...>] [--offline]` | Show the resolved dependency tree |
| `dpm pull <id> [-r <remote...>]` | Fetch a package and its resolved tree. Each package comes from the first remote that has it. |
| `dpm push <id> <remote> [-p <provider...>]` | Send the package and whatever local parts of its tree the remote lacks. Providers (default: all other remotes) are where the server may fetch anything else. |

## Remotes

| Command | Description |
|---|---|
| `dpm remote add <name> <url>` | Add a remote (appended, so it has the lowest priority) |
| `dpm remote remove <name>` | Remove a remote |
| `dpm remote ls` | List remotes in priority order |
| `dpm remote check <name>` | Check that a remote is reachable |

## Server

The reference server:

```bash
PORT=3000 DPM_REGISTRY=/srv/dpm dpm-server
```

`HOST` sets the bind address. `DPM_ALLOW_PROVIDERS=0` stops the server from fetching dependencies from provider URLs given in pushes.
