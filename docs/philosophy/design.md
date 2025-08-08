# Design translations

- Decentralized registries
  - There is no canonical registry. Registries are just file stores with a simple API. This supports plurality of hosts and easy mirroring.
- Full-tree transfer
  - Push and pull operate on entire dependency trees to prevent cross-dependence between registries. Any registry can stand alone without relying on upstreams, which enables continuity during takedowns and simplifies mirroring.
- Deterministic identifiers
  - Package IDs are computed (`name@sha256`) from the file bytes, enabling content addressability, deduplication, and verifiability across registries.
- Local vetting
  - Registrations are vetted by typechecking and by filtering out unexpected file types at the root. This shifts the fitness function toward logical validity.
- Agda-first project structure
  - A single root namespace and stable layout prevent ambiguous module resolution and cross-project naming conflicts.
- Anonymity by default
  - The protocol and data model do not encode author identity; registry operators may layer policy if desired, but the base system does not require identity to publish.
