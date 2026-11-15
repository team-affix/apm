# Deterministic, content-addressed IDs

A package's ID is the IPFS CID of its folder: a hash over its entire contents, file names and folder structure included, with its `dpm.json` of dependency CIDs among them. The same content gives the same CID everywhere, and the CID can never change after the package is created.

Why this matters in a decentralized system:

- **Location independence.** A CID says *what* a package is, never *where* it is. Any node holding the content is a valid source.
- **Mirror integrity.** Two servers holding the same package must agree on its CID; local configuration or policy can't change it.
- **Reproducibility.** A CID refers to exact content. Because a package's dependency CIDs are inside its content, one root CID pins its entire dependency graph.
- **No name-squatting.** There are no names to squat. Anyone may publish a folder called `Kant`; the CID says which one you mean.

Determinism depends on fixed import settings: how files are chunked and encoded changes the CID. DPM always adds with the same settings (CIDv1, raw leaves, SHA-256, 1 MiB chunks: Kubo's `unixfs-v1-2025` profile), leaves out `deps/` and hidden files, and records no timestamps or permissions. Adding the same files again, on any machine, gives the same CID.

Recovery after a takedown: the CID you already hold is the exact question to ask any other node or server ("do you have this?"). Any answer is a perfect copy, because every block is checked against the CID.
