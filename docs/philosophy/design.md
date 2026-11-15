# Design translations

How the principles turn into design decisions.

- **No canonical registry.** Packages live on IPFS, and a DPM server is just a node that has promised to keep some of them. Anyone can run one, and no server is special.
- **Identity is content, not location.** A package is identified only by its CID, the hash of its contents. Dependencies are listed by CID with no host, so where a package comes from is always a free variable: any node that has it is as good as any other.
- **No names.** Folder names inside a package are part of its content, so they can never change for a given CID. DPM itself has no names, and so no name conflicts, overrides or resolver. A CID fixes its whole dependency tree.
- **A protocol, not a platform.** DPM defines the package layout, the install rules and the server API (the standard IPFS Pinning Service API). Each server sets its own acceptance policy; a logic server is one that runs the logic checker. Users still only run `dpm`.
- **Build on what exists.** Storage, transfer and verification are IPFS's job. DPM adds only what IPFS lacks, so there is less of it to audit.
- **Verify, don't trust.** Every block fetched from anywhere is checked against its CID. Servers are untrusted; validity is something each client and server concludes for itself.
- **Adversarial transparency.** Everything a package depends on is named by CID in its content, so everything a claim rests on can be found, inspected and cited. (The logic layer must also forbid private axioms. That's why Agda was dropped: it lets a module keep an axiom private while exporting theorems derived from it.)
- **Anonymity by default.** The protocol and data model encode no author identity. Server operators may add their own policies without breaking compatibility.
