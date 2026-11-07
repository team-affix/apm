# Design translations

How the principles turn into design decisions.

- **No canonical registry.** Registries are dumb hash→bytes stores behind a tiny HTTP API. Anyone can run one, and no registry is special.
- **Identity is content, not location.** A package is named only by `name@sha256(bytes)`. Dependencies are listed by ID with no host, so where a package comes from is always a free variable: any registry that has the bytes is as good as any other.
- **Names are content too.** The name is inside the hashed bytes, so it can never be changed for a given ID. That matters because dependency resolution (overrides, peer conflicts) is keyed on names.
- **Layers stay separate.** The registry stores. The resolver decides whether a package's dependency tree is complete and conflict-free. A layer above (e.g. logic validation) can add a check between resolve and put. Each layer can be audited on its own.
- **Verify, don't trust.** Every package fetched from anywhere is checked against its ID. Registries are untrusted; validity is something each client and server concludes for itself.
- **Adversarial transparency.** Everything a package depends on is named by ID in its content, so everything a claim rests on can be found, inspected and cited. (The logic layer must also forbid private axioms. That's why Agda was dropped: it lets a module keep an axiom private while exporting theorems derived from it.)
- **Anonymity by default.** The protocol and data model encode no author identity. Registry operators may add their own policies without breaking compatibility.
