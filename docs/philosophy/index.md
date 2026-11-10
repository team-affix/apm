# Philosophy

DPM is the storage and distribution layer of a logic platform for public discourse, where the selection pressures on statements are logical validity and consistency. These pages explain the principles and how they shape the design.

The platform is layered:

- **DPM** (this repository): content-addressed packages stored across many independent registries. It knows nothing about logic.
- **The logic language's own tools**: a checker that validates a project (its source plus its installed `deps/`), and logic servers, which are DPM servers whose policy only accepts packages that check. Users only ever have one package manager: `dpm`.

Pages:

- Principles: [principles.md](principles.md)
- Anonymity: [anonymity.md](anonymity.md)
- Idea-centric evaluation: [ideas.md](ideas.md)
- Nuance and Schelling points: [nuance.md](nuance.md)
- Design translations: [design.md](design.md)
- Resilience and decentralization: [resilience.md](resilience.md)
- Deterministic IDs: [deterministic-ids.md](deterministic-ids.md)
- Future directions: [future.md](future.md)
