# Resilience and decentralization

Goals:

- Keep knowledge available despite takedowns or coercion
- Let anyone host, mirror and participate without permission

Mechanisms:

- **Many independent registries.** Push the same package to as many as you like.
- **Location-free IDs.** If a registry disappears, the ID you already hold is the exact question to ask every other registry: "do you have this?" Any yes is a perfect copy, because the bytes are checked against the ID.
- **No forced full-tree replication.** A registry doesn't have to hold a package's whole dependency closure. A push can name *provider* registries where missing dependencies can be found, and the server checks the tree using them. Requiring every registry to hold everything would be redundant.
- **Redundancy that grows on its own.** Anyone who pulls or installs a package keeps a verified copy of its resolved tree in their local registry, so every reader is a potential mirror.

Operational notes:

- Mirrors can be seeded by pulling the IDs they want to keep
- A package whose dependency has vanished from every host can still be read, but its tree no longer resolves, and tools report that clearly instead of hiding it
