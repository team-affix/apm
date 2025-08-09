# CLI Reference

Binary: `apm`

## Top-level commands

- `apm project` — manage the current project
- `apm package` — query/pull/push packages
- `apm remote` — manage remotes

Shorthands also exist for common subcommands: `apm init`, `apm install`, `apm clean`, `apm check`, `apm pack`, `apm tree`, `apm info`, `apm ls`, `apm pull`, `apm push`.

## Project

- `apm project init [project-name] [--pkg <id>]`
  - Initializes a project in the current directory
  - Creates `deps.txt`, root source folder `<project-name>/`, and `.agda-lib`
  - If `--pkg <id>` is supplied, bootstraps from an existing package instead of an empty project
- `apm project install`
  - Resolves the project tree from `deps.txt` and installs dependencies under `deps/`
- `apm project clean`
  - Removes `deps/`
- `apm project check`
  - Typechecks all root `.agda` files using `agda`
- `apm project pack`
  - Creates a package from the current project and registers it in the local registry
  - Prints the resulting package id `name@<sha256>`
- `apm project tree`
  - Prints the dependency tree of the current project

## Package

- `apm package info <id>`
  - Prints file path, name, id, direct deps, archive offset
- `apm package tree <id>`
  - Prints the dependency tree of the given package
- `apm package ls [ids...] [-r, --remote <name>]`
  - Without `-r`, lists locally present package IDs (or filters by provided IDs)
  - With `-r`, queries the named remote for the presence of provided IDs and prints those that exist there
- `apm package pull <remote> <id>`
  - Pulls `<id>` and its entire dependency tree from `<remote>` into the local registry. Full-tree pull avoids cross-dependence on other registries.
- `apm package push <remote> <id>`

  - Pushes `<id>` and its entire dependency tree to `<remote>`. Full-tree push ensures the remote registry is self-sufficient without upstreams.

  Example (back up your beliefs):

  ```bash
  apm package push backupRemote SomePkg@<sha256>
  # The remote registry vets each submitted package in the dependency tree
  ```

## Remote

- `apm remote ls`
  - Lists known remotes from `~/.apm/client/remotes.json`
- `apm remote add <name> <url> [--skip-health-check]`

  - Performs a health check on `<url>/health` and only adds the remote if it succeeds. Use `--skip-health-check` to bypass the check.

  Example:

  ```bash
  # will fail to add if health check fails
  apm remote add backupRemote http://example.org

  # bypass health check
  apm remote add backupRemote http://example.org --skip-health-check
  ```

- `apm remote rm <name>`
  - Removes a remote
- `apm remote health <name>`
  - Hits `<url>/health` for the named remote
