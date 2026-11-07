# Future directions

## DLPM: the logic layer

A decentralized logic package manager: its own client and server, speaking the DPM protocol and built from the DPM library. Its server's push sequence is: hash check → resolve → **logical validation of the resolved trees** → store. To validate, it unpacks the resolved packages (`unpackToDirectory`), runs the logic kernel, and rejects with 422 on failure.

Because the protocol is shared, a `dlpm` client can push to a plain DPM server (which stores without checking logic), and a `dpm` client can push to a DLPM server (which accepts only what checks).

Notes for the logic layer:

- Validity belongs to a *resolved tree*, not to a package alone. Overrides swap dependencies, so a package checked against one `C` must be re-checked when a dependent overrides `C`.
- That also makes overrides a tool for debate: "take this argument, but plug in my version of `C`." If it still checks, the conclusion survives the changed assumption. If not, the checker shows where it depended on the original.

## DPM

- Finding packages at scale: gossip between registries, or a DHT / IPFS backend, in addition to configured remote lists
- Self-describing hashes (multihash/CID) so the hash algorithm can change without breaking old IDs
- Optional signatures and attestations that keep anonymity possible
- Pinning and mirroring policies for registry operators
