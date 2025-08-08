# APM Overview

APM (Agda Package Manager) is a package format, local registry, and simple remote protocol built for Agda. It’s a pragmatic precursor to a broader vision: a venue for public discourse where claims are evaluated primarily by logical validity and consistency. APM provides a minimal, resilient substrate for publishing, distributing, and typechecking Agda artifacts.

## Motivation and philosophy

- Agda-first: honor Agda’s module resolution and project expectations. Projects have a single root source directory and `.agda-lib` with include paths.
- Deterministic identity: packages are addressed by `name@<sha256>` of the package file bytes.
- Local vetting: package registration typechecks content and rejects non-Agda/Markdown files in the root source.
- Decentralized: no single canonical registry. Any party can run a registry server; registries can mirror each other.
- Resilience and anonymity: pushing/pulling transfers the full dependency tree, enabling independence from upstream registries. The protocol does not require author identity.

## Architecture at a glance

- Package format: a single binary file with header fields (name, direct-deps JSON) followed by the archive bytes. The ID derives from hashing the bytes and pairing with the name.
- Local registry: a filesystem directory storing package files under `packages/<id>`. Default locations:
  - Client: `~/.apm/client/registry`
  - Server: `~/.apm/server/registry`
- Client CLI (`apm`): project lifecycle (init/install/check/pack), remote management, and package transfer commands.
- Server (`apm-server`): Express + tRPC endpoint exposing `get`, `put`, `ls`, and `getPullDependencies`.

## Data model basics

- Package ID: `name@<sha256>`; the hash is computed over the entire package file contents.
- Direct dependencies: stored in the package binary as JSON array of package IDs; projects keep a `deps.txt` file listing required IDs.
- Project layout:
  - `<ProjectName>/` root source directory containing `.agda` and optional `.md` files
  - `.agda-lib` file with `name: <ProjectName>` and `include: . deps`
  - `deps.txt` listing package IDs, one per line

## Dependency trees and overrides

When building a project tree from direct dependencies, APM:

- Eliminates peer conflicts using package name overrides (no two direct deps with the same package name)
- Builds a forest of `PackageTree` objects and topologically sorts them for installation
- Installs dependencies into `deps/<PackageName>` folders

See [docs/concepts.md](concepts.md) for deeper details.
