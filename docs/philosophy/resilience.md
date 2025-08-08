# Resilience and decentralization

Goals:

- Keep knowledge accessible despite takedowns or coercion
- Allow anyone to host, mirror, and participate without permission

Mechanisms:

- Decentralized registries: no central dependency
- Full dependency tree replication on push/pull to avoid cross-dependence between registries and ensure each registry is self-sufficient
- Content-addressed package IDs for integrity and deduplication

Operational notes:

- Mirrors can be seeded by querying and pulling needed IDs
- Operator policies can be layered locally without breaking compatibility
