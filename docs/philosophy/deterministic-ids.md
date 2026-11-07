# Deterministic, content-addressed IDs

A package's ID is `name@<sha256>`, where the hash covers the package's entire canonical encoding: name, direct dependency IDs and payload. The same content gives the same ID everywhere, and the ID can never change after the package is created.

Why this matters in a decentralized system:

- **Location independence.** An ID says *what* a package is, never *where* it is. Any registry holding those bytes is a valid source.
- **Mirror integrity.** Two registries holding the same package must agree on its ID; local configuration or policy can't change it.
- **Reproducibility.** An ID refers to exact bytes. Because a package's dependency IDs are inside its hashed content, one root ID pins its entire dependency graph.
- **No name-squatting.** Anyone may publish a package named `Kant`. The hash says which one you mean.

Canonical encoding:

- Dependencies are deduplicated and sorted by their UTF-8 bytes before encoding, and decoding rejects anything that is not canonical. So the same (name, deps, payload) has exactly one encoding, and one ID.
- When a payload is built from a directory (`dpm pack`), the archive is deterministic: sorted entries, zeroed timestamps, fixed permissions and ownership. Re-packing the same files gives the same ID.

Recovery after a takedown:

```bash
# which of these IDs does the backup registry have?
dpm ls -r backup Kant@<sha256> Hume@<sha256>

# fetch from whichever configured remote has it
dpm pull Kant@<sha256>
```

Verification is everywhere: registries recompute the ID of every package they store, and clients check every package they fetch against the ID they asked for. A registry serving wrong bytes is skipped, not trusted.
