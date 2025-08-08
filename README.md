# APM — Agda Package Manager

APM is a package manager and minimal registry protocol designed specifically for Agda. It aims to support a broader vision: a logic platform for public discourse where selection pressures on statements are logical validity and consistency. APM is a precursor project toward that goal.

- Built for Agda’s needs during typechecking (e.g., project structure and global search path constraints)
- Deterministic package identity (`name@sha256` of the package payload)
- Local vetting on publish/registration (typechecking and file hygiene)
- Decentralized registries; no single “home” registry
- Designed with anonymity and resilience in mind (see docs for goals and model)

## Requirements

- Node.js 18+ (for the CLI and server)
- Agda installed and available on PATH (used for typechecking during vetting and `apm project check`)

## Install

```bash
npm i -g @team-affix/apm-client
```

- CLI binary: `apm`

## Quickstart

1. Add a remote registry:

```bash
apm remote add backupRemote http://example.org
```

3. Create a new Agda project in an empty directory:

```bash
mkdir mypkg && cd mypkg
apm init MyPkg
```

This creates:

- `MyPkg/` (your root source)
- `.agda-lib` (Agda library file with include paths)
- `deps.txt` (list of package IDs your project depends on)

4. Typecheck your project:

```bash
apm check
```

5. Package and register it locally:

```bash
apm pack
# prints: Package created: MyPkg@<sha256>
```

5. List packages in your local registry

```bash
apm ls
```

6. Push your package (and its entire dependency tree) to a remote registry:

```bash
apm package push MyRemote MyPkg@<sha256>
```

7. On another machine, clone by pulling the package (and full tree) from the remote into your local registry:

```bash
apm package pull MyRemote MyPkg@<sha256>
```

## CLI at a glance

- Project:
  - `apm project init [project-name] [--pkg <id>]`
  - `apm project install`
  - `apm project clean`
  - `apm project check`
  - `apm project pack`
  - `apm project tree`
- Package:
  - `apm package info <id>`
  - `apm package tree <id>`
  - `apm package ls [ids...] [-r, --remote <name>]`
  - `apm package pull <remote> <id>`
  - `apm package push <remote> <id>`
- Remote:
  - `apm remote ls`
  - `apm remote add <name> <url> [--skip-health-check]`
  - `apm remote rm <name>`
  - `apm remote health <name>`

Shorthands: `apm init`, `apm install`, `apm clean`, `apm check`, `apm pack`, `apm info`, `apm ls`, `apm pull`, `apm push`.

## Registries and resilience

- APM uses decentralized registries. Every server provides http access to a registry; any client can pull from and push to any registry.
- When pushing or pulling, APM transfers the entire package tree to prevent cross-dependence between registries and keep each registry self-sufficient even if others disappear.
- Local registry path:
  - Client default: `~/.apm/client/registry`

## Concepts and design goals

- Agda-first: package/project structure maps to Agda’s global search path; projects have a single root module namespace.
- Deterministic IDs: each package file’s bytes determine its id; IDs look like `name@<sha256>`, where `name` is the agda source folder name, NOT an arbitrary name given to the package after compilation. [more on this](docs/philosophy/deterministic-ids.md)
- Vetting: on registration/publish, APM verifies only `.agda` and `.md` files in the root source, installs declared deps, and typechecks using Agda.
- Decentralized model, anonymity, and takedown resilience are core design goals.

## Documentation

- Overview and goals: [docs/overview.md](docs/overview.md)
- CLI reference: [docs/cli.md](docs/cli.md)
- Registry model and storage layout: [docs/registry.md](docs/registry.md)

- Concepts: vetting, package IDs, dependency trees, Agda constraints: [docs/concepts.md](docs/concepts.md)
- Philosophy and goals: [docs/philosophy/index.md](docs/philosophy/index.md)

## License

MIT License. See `LICENSE`.
