# Dependencies

APM models dependencies in a way that matches Agda’s module resolution constraints and enables decentralized, overrideable graphs.

## Direct vs transitive

- Each package carries a set of direct dependencies: a list of package IDs (e.g., `Name@<sha256>`)
- A project’s `deps.txt` lists the direct dependency IDs for the root package
- Transitive dependencies are discovered by walking each dependency’s direct deps, forming a `PackageTree`, then installing in topological order

All referenced package IDs are expected to already exist in your local registry. Use pull/push to synchronize missing IDs.

## Name-based overrides (by design)

Agda’s global module resolution means there can only be one package providing a given top-level module name in a project. Therefore, overrides are done by package name (not by ID):

- Suppose the graph is `A -> B -> C-Original`
- You want to replace `C-Original` with `C-Override` (same package name `C`, different content/ID)
- You can force the replacement by adding `C-Override`’s ID to `A`’s direct dependencies (root `deps.txt`)
- This works because the root declares that the package with name `C` should be `C-Override`, which overrides transitive references that would have selected `C-Original`

Example (root `deps.txt`):

```text
B@<sha256-of-B>
C@<sha256-of-C-Override>
```

Notes:

- Overrides target the package name. The IDs can differ, but the names must match (e.g., both are named `C`)
- This enables consumers to adopt updated packages even if intermediate maintainers (e.g., `B`) have not released a new version
- Caution: replacement can cause typechecking failures if `B` relied on symbols present in `C-Original` that `C-Override` does not provide (or changes)

## Peer dependency resolution and root dominance

Within a single project, there may only be one dependency with a given package name. If peers introduce multiple packages with the same name, a peer dependency resolution error occurs.

How conflicts are resolved:

- The root package (your project) dominates. To resolve a conflict for a name `X`, ensure `deps.txt` contains exactly one package ID whose name is `X`
- That declaration acts as the tie-breaker, overriding transitive peers for the same name

Symptoms and fixes:

- Error: unresolved peer dependency for name `X` → declare a direct dependency on your chosen `X` in `deps.txt`
- Multiple distinct packages with the same name declared directly → remove extras so only one remains for that name

## Summary

- Direct dependencies are specified by IDs and must exist locally
- Only one package per name may appear in a project
- Overrides are by name: place your chosen package for that name in the root `deps.txt`
- Expect typechecking to surface incompatibilities when swapping implementations that share a name

For background on why APM is name-sensitive and content-addressed, see:

- [concepts.md](concepts.md)
- [philosophy/deterministic-ids.md](philosophy/deterministic-ids.md)
