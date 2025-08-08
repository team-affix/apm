# Future directions

- Stronger reproducibility guarantees (pinned toolchains, hermetic builds)
- Content signatures and optional attestations (while keeping anonymity possible)
- Federation and mirroring protocols beyond push/pull (gossip or CRDT-like sync)
- Richer query/indexing layers that still preserve the minimal, verifiable core

## Proof packages (proposed)

A strict class of packages intended for formal results:

- Allowed: non-postulated Agda content (definitions, theorems, derivations)
- Disallowed: introducing new axioms (no `postulate` declarations)
- Dependencies: may depend on any type of package (proof or non-proof)

Enforcement ideas:

- Extend registry vetting for proof packages to reject root-source usage of `postulate`
- Optional linter to check the entire dependency closure for postulates if desired

Open questions:

- How to mark a package as a proof package (metadata, naming convention, or header flag)
- Policy around foundational libraries and standard axioms
- How to surface proof/non-proof status in discovery and tooling
