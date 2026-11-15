# Resilience and decentralization

Goals:

- Keep knowledge available despite takedowns or coercion
- Let anyone host, mirror and participate without permission

Mechanisms:

- **Many independent servers.** Push the same package to as many as you like. Any IPFS node can also keep it.
- **Location-free IDs.** If a server disappears, the CID you already hold is the exact question to ask every other node: "do you have this?" Any yes is a perfect copy, because every block is checked against the CID.
- **No forced full-tree replication by the protocol.** Each package in a tree can come from a different place. A server decides for itself what to keep; the reference server keeps a package's whole tree, so it can serve all of it.
- **Redundancy that grows on its own.** Anyone who installs a package keeps a verified copy of its tree in their own IPFS node, so every reader is a potential source.

Operational notes:

- Mirrors can be seeded by pinning the CIDs they want to keep
- A package whose dependency has vanished from every node can still be read, but its tree can no longer be installed, and `dpm install` reports exactly which CID is missing
