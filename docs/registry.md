# Registry

APM stores packages in a local filesystem registry. Both client and server use the same structure, with different default locations.

- Client default registry: `~/.apm/client/registry`
- Server default registry: `~/.apm/server/registry`
- Packages directory: `<registry>/packages/`
- Package file path: `<registry>/packages/<id>` where `<id>` is `name@<sha256>`

## Creation and loading

- On first use, if the registry path does not exist, it is created with an empty `packages/` directory.
- Loading validates that `packages/` exists.

## Package vetting (on put/register)

When a package is registered (either locally via `apm project pack` or via server `put`):

- The SHA‑256 is recomputed from the bytes and the canonical ID `name@sha256` is verified (if an expected ID is provided, it must match)
- A temporary project is created from the package contents
- The project is validated to ensure only `.agda` and `.md` exist in the root source
- The full project dependency tree is resolved via the registry
- Dependencies are installed into the temp project
- The project is typechecked with Agda
- If everything succeeds, the package file is copied into `packages/<id>`

If any step fails, the registration is rejected with an error.

## Listing and querying

- `ls([])`: list all local package IDs found under `packages/`
- `ls([ids...])`: filter that list by the provided IDs

## Dependency trees

- `getPackageTree(id)`: returns the full tree (a root plus all transitive deps)
- `getProjectTree(directDeps)`: builds a forest for a project from direct deps, respecting name-based override rules to avoid peer conflicts
