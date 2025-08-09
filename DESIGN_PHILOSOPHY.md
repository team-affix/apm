# Design Philosophy: From Principles to Implementation

This document explains how APM's philosophical principles translate into specific technical decisions and system architecture. Each design choice serves the broader vision of creating infrastructure for logic-based discourse.

---

## Table of Contents

- [Philosophy-to-Design Translation](#philosophy-to-design-translation)
- [Decentralized Architecture](#decentralized-architecture)
- [Anonymous Publishing](#anonymous-publishing)
- [Content Addressing and Integrity](#content-addressing-and-integrity)
- [Local Vetting and Quality Control](#local-vetting-and-quality-control)
- [Agda-Centric Package Structure](#agda-centric-package-structure)
- [Resilience Through Redundancy](#resilience-through-redundancy)
- [Operational Implications](#operational-implications)

---

## Philosophy-to-Design Translation

APM's architecture directly implements its philosophical principles through specific technical choices:

### From Principle to Practice

| **Philosophical Principle** | **Technical Implementation** | **Why This Design** |
|------------------------------|------------------------------|---------------------|
| **Truth-seeking via formal methods** | Local vetting with Agda typechecking | Mechanically verifies logical validity before accepting packages |
| **Anonymous publishing** | No identity fields in package format or protocol | Cannot suppress ideas based on author identity |
| **Resilience to suppression** | Decentralized registries with full-tree replication | No single point of failure; mirrors can preserve knowledge |
| **Explicit assumptions** | Dependency trees with content-addressed IDs | Makes assumption chains visible and verifiable |
| **Minimal coordination** | Simple HTTP+JSON protocol | Easy to implement and audit; reduces gatekeeping |
| **Validity over truth** | Typechecking without axiom filtering | Accepts any logically consistent content regardless of conclusions |

---

## Decentralized Architecture

### No Canonical Registry

**Design**: There is no central registry. Registries are just file stores with a simple API.

**Implementation**: 
- Anyone can run `apm-server` to host a registry
- Clients can add/remove registries freely 
- No protocol-level hierarchy or authority structure

**Philosophical Basis**: This supports plurality of hosts and easy mirroring, ensuring no single entity can control knowledge distribution.

### Full-Tree Transfer

**Design**: Push and pull operate on entire dependency trees.

**Implementation**:
- `apm push` transfers a package and all its dependencies
- `apm pull` retrieves a package and all its dependencies  
- Each registry becomes self-sufficient for any packages it hosts

**Philosophical Basis**: Prevents cross-dependence between registries. Any registry can stand alone without relying on upstreams, enabling continuity during takedowns and simplifying mirroring.

### Simple Protocol

**Design**: Minimal HTTP+JSON API with four operations: `get`, `put`, `ls`, `getPullDependencies`.

**Implementation**:
```typescript
// Server API surface
interface RegistryAPI {
  get(id: string): { b64: string }           // Retrieve package
  put(id: string, b64: string): { id: string } // Store package  
  ls(ids: string[]): { ids: string[] }       // Check presence
  getPullDependencies(rootId: string): { pkgIds: string[] } // Get dep tree
}
```

**Philosophical Basis**: Simplicity reduces implementation barriers and makes the system auditable. Anyone can implement a compatible registry without needing complex coordination protocols.

---

## Anonymous Publishing

### No Identity in Data Model

**Design**: The package format and protocol contain no identity fields.

**Implementation**:
```
Package format:
- 4 bytes: name length  
- name bytes: UTF-8 string (package name, not author name)
- 4 bytes: deps length
- deps bytes: JSON array of package IDs
- remaining: archive data
```

**Philosophical Basis**: Identity-based evaluation corrupts discourse by introducing irrelevant factors. By making identity technically impossible to embed, the system forces evaluation based on content.

### Optional Policy Layers

**Design**: Registry operators can layer policies without breaking protocol compatibility.

**Implementation**: 
- Base protocol has no authentication or identity requirements
- Individual registries can add signature verification, access controls, etc.
- Clients work with any registry regardless of local policy choices

**Philosophical Basis**: Enables policy pluralism while preserving anonymity by default. Communities can add trust mechanisms if desired without compromising the core principle.

### Network-Level Considerations

**Design**: The protocol itself is anonymous, but operational security is the user's responsibility.

**Implementation**:
- No client identification in HTTP requests beyond standard headers
- Package content is the only identifying information
- Network-level anonymity (Tor, VPNs) is encouraged but not enforced

**Philosophical Basis**: The protocol removes identity barriers, but users must consider their own threat models for complete anonymity.

---

## Content Addressing and Integrity

### Deterministic Package IDs

**Design**: Package IDs are computed as `name@sha256` where the hash covers the entire file bytes.

**Implementation**:
```typescript
function computePackageId(name: string, fileBytes: Buffer): string {
  const hash = crypto.createHash('sha256').update(fileBytes).digest('hex');
  return `${name}@${hash}`;
}
```

**Philosophical Basis**: Deterministic identifiers enable content addressability, deduplication, and verifiability across registries without central coordination.

### Tamper Detection

**Design**: Any modification to package contents produces a different ID.

**Implementation**:
- During vetting, APM recomputes the hash and verifies it matches the claimed ID
- Clients can verify package integrity by recomputing hashes
- Different registries must agree on IDs for identical packages

**Philosophical Basis**: Protects against content tampering and ensures that package references are stable across mirrors.

### Namespace Safety

**Design**: Names are human-readable prefixes, not global identifiers.

**Implementation**:
- Multiple packages can have the same name if they have different content (different hashes)
- Package resolution uses the full `name@hash` identifier
- No global namespace conflicts are possible

**Philosophical Basis**: Prevents namesquatting and ensures that references to ideas remain stable even in a decentralized system.

---

## Local Vetting and Quality Control

### Mechanical Validation

**Design**: Every package is typechecked before registration.

**Implementation** (vetting process):
1. Extract package to temporary directory
2. Verify only `.agda` and `.md` files exist in root source
3. Resolve and install all dependencies
4. Run `agda` on all `.agda` files in root source  
5. Accept package only if all steps succeed

**Philosophical Basis**: Creates a fitness function that favors logical validity. Ideas that don't typecheck are mechanically rejected, shifting selection pressure toward formal rigor.

### File Type Restrictions

**Design**: Only `.agda` and `.md` files are allowed in package root source.

**Implementation**:
```typescript
const allowedExtensions = ['.agda', '.md'];
for (const file of rootSourceFiles) {
  if (!allowedExtensions.includes(path.extname(file))) {
    throw new Error(`Unexpected file type: ${file}`);
  }
}
```

**Philosophical Basis**: Enforces focus on logical content (Agda) and documentation (Markdown). Prevents packages from including executables, configuration, or other non-logical content.

### Dependency Verification

**Design**: All referenced dependencies must exist and be vettable before accepting a package.

**Implementation**:
- Parse dependency list from package metadata
- Verify all dependencies exist in local registry
- Recursively check that dependency tree is complete and valid
- Install dependencies in isolated environment for typechecking

**Philosophical Basis**: Ensures assumption chains are complete and verifiable. You can't depend on non-existent or invalid logical foundations.

---

## Agda-Centric Package Structure

### Single Root Namespace

**Design**: A package has exactly one root directory named exactly as the package name.

**Implementation**:
```
MyPackage/
├── Core.agda           # Module: MyPackage.Core
├── Utils.agda          # Module: MyPackage.Utils  
└── Subdir/
    └── Advanced.agda   # Module: MyPackage.Subdir.Advanced
```

**Philosophical Basis**: Maps cleanly to Agda's module system and prevents naming conflicts. Each package provides exactly one top-level logical namespace.

### Sandboxed Dependencies

**Design**: Projects only see their own code and explicitly declared dependencies.

**Implementation**:
- `.agda-lib` includes only project root and `deps/` directory
- Dependencies installed to `deps/PackageName/`
- No access to global Agda libraries or system-wide packages

**Philosophical Basis**: Ensures reproducible builds and forces explicit declaration of all assumptions. You can't accidentally depend on hidden global state.

### Name-Based Overrides

**Design**: Dependency conflicts are resolved by package name, with root project dominating.

**Implementation**:
- If multiple dependencies reference packages with the same name, root project's choice wins
- Enables swapping implementations while maintaining logical consistency
- Transitive dependencies can be overridden by declaring them directly

**Philosophical Basis**: Allows consumers to choose their foundational assumptions even when intermediate dependencies haven't updated.

---

## Resilience Through Redundancy

### Mirror-Friendly Architecture

**Design**: Registries can be easily replicated and synchronized.

**Implementation**:
- Each registry is just a directory of package files
- No registry-specific metadata or configuration
- Packages have identical IDs across all registries

**Philosophical Basis**: Enables knowledge preservation through distributed backups. Important ideas can survive targeted suppression.

### Graceful Degradation

**Design**: The network continues functioning even if some registries disappear.

**Implementation**:
- Clients can work with multiple registries simultaneously
- Package dependencies are resolved from any available registry
- No critical operations require specific registries to be online

**Philosophical Basis**: Protects against censorship and ensures continuity of access to logical content.

### Self-Sufficient Registries

**Design**: Each registry contains complete dependency trees for its packages.

**Implementation**:
- Push operations transfer the full dependency closure
- Registries never need to fetch from other registries
- Each registry can operate independently

**Philosophical Basis**: Eliminates cascade failures and ensures that each registry preserves a complete logical foundation for its content.

---

## Operational Implications

### For Registry Operators

**Policy Freedom**: Each registry can implement its own policies (access controls, content filtering, etc.) without breaking compatibility.

**Minimal Infrastructure**: Registries require only basic file storage and HTTP serving capability.

**Easy Mirroring**: Operators can selectively mirror content from other registries by pulling specific packages.

### For Package Authors

**Anonymous Options**: Authors can publish without revealing identity while maintaining logical accountability.

**Assumption Transparency**: Dependencies make the logical foundations of any work clearly visible.

**Resilient Distribution**: Once published to multiple registries, ideas become very difficult to suppress.

### For Users

**Registry Choice**: Users can choose which registries to trust and use based on their own values and requirements.

**Verifiable Content**: All logical claims can be independently verified through typechecking.

**Portable Dependencies**: Package references work across registries, enabling easy migration.

### For the Ecosystem

**Emergent Quality**: The vetting process creates natural selection pressure toward higher-quality logical reasoning.

**Composable Knowledge**: Small, focused packages can be combined to build complex arguments.

**Preserved Discourse**: Important logical contributions are preserved even if original authors or registries disappear.

---

## Conclusion

APM's design philosophy demonstrates how abstract principles can be translated into concrete technical systems. Every major design decision—from content addressing to decentralized architecture to local vetting—serves the ultimate goal of creating better infrastructure for logical discourse.

The system is designed to evolve with its community while preserving its core commitments to anonymity, decentralization, and logical validity. As the ecosystem grows, these design principles provide a foundation for evaluating proposed changes and extensions.

**The measure of any proposed change should be: Does this make logical discourse more accessible, more resilient, and more focused on validity rather than authority?**