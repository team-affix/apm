# Concepts

## Package format and IDs

A package is a single file with the following structure:

- 4 bytes: name length (uint32 LE)
- name bytes (UTF-8)
- 4 bytes: direct deps length (uint32 LE)
- direct deps bytes (UTF-8 JSON array of package IDs)
- remaining bytes: archive (the source payload)

The package ID is computed as `name@<sha256>` where the hash is over the entire file bytes. See [philosophy/deterministic-ids.md](philosophy/deterministic-ids.md) for why content-addressing is critical in a decentralized design.

## Project structure and Agda constraints

- One root directory named exactly as the project name (also the top-level Agda module namespace)
- `.agda-lib` pinned to include the root and `deps/`
- Direct deps listed in `deps.txt` by package ID, one per line
- Root source may contain `.agda` and `.md` files; other extensions in the root source are rejected during vetting

This enforces a clean Agda module layout and prevents multiple packages from colliding on the same top-level module name within a single project. See [philosophy/why-agda.md](philosophy/why-agda.md) and [registry.md](registry.md) for background on layout and library includes.

## Sandboxing

Projects are sandboxed by the `.agda-lib` file, which includes only the project root and `deps/`. Because no external Agda libraries are referenced:

- The project can import Agda builtins
- The project can import modules from its installed dependency sources (`deps/<PackageName>`)
- The project can import modules from its own root source (`<ProjectName>/`)

This ensures reproducible, self-contained builds aligned with APM’s registry model.

## Vetting flow

- Build a temporary project from the package
- Reject any unexpected file types in the root
- Resolve the project tree for direct dependencies
- Install dependencies into `deps/<PackageName>`
- Run `agda` on root `.agda` files

Only if all steps succeed will the package be accepted into a registry. See [registry.md](registry.md) for details on vetting and storage.

## Dependency resolution and overrides

- A project defines its direct dependency set (package IDs)
- The registry constructs a forest of `PackageTree` structures
- Name-based overrides prevent unresolved peer conflicts: if multiple packages reference a dependency with the same top-level name, direct deps take precedence and peers are disallowed unless overridden transitively
- Installation lays out deps under `deps/<PackageName>` preserving topological order

See [dependencies.md](dependencies.md) for a detailed guide to dependency management and peer resolution.

## Decentralization, anonymity, and resilience

- There is no central registry; anyone can run a server and mirror packages. See [philosophy/resilience.md](philosophy/resilience.md).
- Push and pull transfer full dependency trees so a registry can stand alone if others disappear. See [philosophy/design.md](philosophy/design.md).
- The protocol does not bind identities to packages; registry operators may layer policies independently if desired. See [philosophy/anonymity.md](philosophy/anonymity.md).
