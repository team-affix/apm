# APM — Agda Package Manager

**A decentralized package manager for Agda, built as a foundation for logical discourse.**

APM is both a practical tool for managing Agda packages and a prototype for something larger: a platform where ideas are evaluated by their logical validity rather than the identity or reputation of their authors. It's designed for a world where truth-seeking happens through formal verification, anonymous publication, and decentralized resilience against censorship.

---

## Table of Contents

- [What is APM?](#what-is-apm)
- [Why APM Exists: The Bigger Picture](#why-apm-exists-the-bigger-picture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Philosophy and Vision](#philosophy-and-vision)
- [Real-World Examples](#real-world-examples)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## What is APM?

APM (Agda Package Manager) is a **decentralized, content-addressed package manager** built specifically for [Agda](https://agda.readthedocs.io/), a dependently typed functional programming language and proof assistant.

### Key Features

- **🔗 Deterministic Identity**: Packages are identified by `name@sha256` of their contents, ensuring perfect reproducibility
- **🌐 Decentralized Registries**: No single point of failure—anyone can run a registry, mirror packages, and maintain independence
- **🛡️ Anonymous Publishing**: Publish without revealing your identity, focusing evaluation on logical merit
- **✅ Local Vetting**: Every package is typechecked and validated before registration
- **🏗️ Agda-First Design**: Respects Agda's module system and project structure constraints
- **🌳 Full-Tree Synchronization**: Push/pull entire dependency trees to ensure registry self-sufficiency

### At a Glance

```bash
# Initialize a new Agda project
mkdir MyLogic && cd MyLogic
apm init MyLogic

# Add some Agda code, then package and publish
echo 'module MyLogic.Core where' > MyLogic/Core.agda
echo 'data Truth : Set where' >> MyLogic/Core.agda  
echo '  ⊤ : Truth' >> MyLogic/Core.agda

# Create and register package locally
apm pack
# → Package created: MyLogic@a1b2c3d4e5f6...

# Push to a remote registry (with full dependency tree)
apm remote add myregistry https://my-logic-registry.org
apm push myregistry MyLogic@a1b2c3d4e5f6...
```

---

## Why APM Exists: The Bigger Picture

APM isn't just another package manager. It's a step toward **fixing how we evaluate ideas in public discourse**.

### The Problem with Current Discourse

Today's platforms for sharing ideas suffer from fundamental problems:

- **Identity politics** often determines acceptance rather than logical merit
- **Centralized platforms** can suppress inconvenient truths
- **Social proof mechanisms** create echo chambers and groupthink
- **Informal argumentation** allows claims to remain vague and unfalsifiable

### APM's Vision: Logic-First Discourse

Imagine a world where:

- **Claims must be formalized** to be published, forcing precision and clarity
- **Logical validity is mechanically verified** by typecheckers, not human reviewers  
- **Authors can remain anonymous**, removing identity-based bias from evaluation
- **Assumptions are explicit** and traceable through dependency trees
- **Resilient networks** preserve important ideas even under political pressure

APM is the first step toward this vision, providing the infrastructure for:

1. **Publishing formal proofs and definitions** with cryptographic integrity
2. **Anonymous yet verifiable discourse** where ideas stand on their own merit
3. **Decentralized knowledge preservation** resistant to censorship and takedowns
4. **Explicit assumption tracking** through dependency relationships

### Why Agda?

Agda offers unique advantages for this vision:

- **Dependent types** allow expressing sophisticated logical relationships
- **Totality checking** ensures proofs are complete and well-founded
- **Simple module system** maps cleanly to package namespaces
- **Academic acceptance** in the formal verification community
- **Readable syntax** accessible to non-specialists

---

## Quick Start

### Prerequisites

- **Node.js 18+** (for the CLI)
- **Agda 2.6+** installed and available on PATH

### Installation

```bash
npm install -g @team-affix/apm-client
```

This gives you:
- `apm` - The CLI tool for managing packages and projects
- `apm-server` - Registry server (for hosting your own registry)

### Your First Project

1. **Create a new project:**
   ```bash
   mkdir mathematical-foundations && cd mathematical-foundations
   apm init MathFoundations
   ```

2. **This creates:**
   ```
   MathFoundations/        # Your Agda source directory
   .agda-lib              # Agda library file
   deps.txt               # Package dependencies (initially empty)
   ```

3. **Add some logic:**
   ```bash
   cat > MathFoundations/BasicLogic.agda << 'EOF'
   module MathFoundations.BasicLogic where

   -- Define basic logical operations
   data _⊎_ (A B : Set) : Set where
     inj₁ : A → A ⊎ B
     inj₂ : B → A ⊎ B

   -- Prove commutativity of disjunction
   ⊎-comm : {A B : Set} → A ⊎ B → B ⊎ A
   ⊎-comm (inj₁ a) = inj₂ a
   ⊎-comm (inj₂ b) = inj₁ b
   EOF
   ```

4. **Verify it typechecks:**
   ```bash
   apm check
   ```

5. **Package and register locally:**
   ```bash
   apm pack
   # → Package created: MathFoundations@4f8a9c2e1b7d3a5f...
   ```

6. **See your local packages:**
   ```bash
   apm ls
   ```

### Working with Remote Registries

1. **Add a remote registry:**
   ```bash
   apm remote add backup https://backup-registry.example.org
   ```

2. **Push your package (with all dependencies):**
   ```bash
   apm push backup MathFoundations@4f8a9c2e1b7d3a5f...
   ```

3. **On another machine, pull the package:**
   ```bash
   apm pull backup MathFoundations@4f8a9c2e1b7d3a5f...
   ```

4. **Use it in a new project:**
   ```bash
   mkdir my-proofs && cd my-proofs
   apm init MyProofs
   echo "MathFoundations@4f8a9c2e1b7d3a5f..." >> deps.txt
   apm install
   ```

---

## Core Concepts

### Deterministic Package Identity

Every package has an ID like `PackageName@sha256hash`. The hash is computed from the exact bytes of the package file, ensuring:

- **Perfect reproducibility**: Same bytes = same ID everywhere
- **Tamper detection**: Any change creates a different ID
- **Namespace safety**: Names are human-readable prefixes, not global identifiers
- **Decentralized integrity**: No central authority needed to verify authenticity

### Agda-Centric Design

APM respects Agda's constraints:

- **One top-level module per package**: Your package name becomes the root module namespace
- **Clean dependency resolution**: Dependencies installed to `deps/PackageName/`
- **Sandboxed builds**: Only your code and declared dependencies are available
- **Standard `.agda-lib` layout**: Works with existing Agda tooling

### Local Vetting

Before any package is registered (locally or remotely), APM:

1. ✅ Verifies the package ID matches the file contents
2. ✅ Checks only `.agda` and `.md` files exist in the source
3. ✅ Resolves and installs all dependencies  
4. ✅ Runs `agda` to typecheck every `.agda` file
5. ✅ Only accepts the package if everything succeeds

This creates a **fitness function favoring logical validity** over other criteria.

### Decentralized by Design

- **No canonical registry**: Anyone can run `apm-server` and host packages
- **Full-tree replication**: Push/pull transfers complete dependency trees
- **Registry independence**: Each registry can operate standalone
- **Mirror-friendly**: Easy to backup and replicate package collections

---

## Philosophy and Vision

### Truth-Seeking Through Formalization

APM embodies several key principles:

**Validity over Truth**: APM doesn't determine which axioms are true, but it ensures that conclusions follow logically from stated assumptions. Truth requires knowing which axioms to believe; validity requires only logical consistency.

**Anonymous Evaluation**: By removing identity from the evaluation process, APM creates space for ideas to be judged on their logical merit rather than their author's reputation, politics, or social standing.

**Explicit Assumptions**: In Agda, you must declare your axioms and assumptions explicitly. This makes it easy to see exactly what any conclusion depends on, enabling more precise agreement and disagreement.

**Compositional Reasoning**: Small, focused packages encourage breaking complex arguments into reusable components, making it easier to identify and challenge specific assumptions.

### Resilience and Freedom

**Censorship Resistance**: Decentralized registries mean no single entity can suppress ideas. If one registry goes down, mirrors can continue serving the same content.

**Preserved Knowledge**: Content-addressed storage means important proofs and arguments can be preserved indefinitely across multiple hosts.

**Anonymous Publishing**: Authors can contribute ideas without revealing their identity, protecting them from retaliation while ensuring focus remains on logical content.

### Long-Term Vision

APM is a prototype for a **logic platform for public discourse** where:

- Political arguments include formal models and proofs
- Scientific claims come with mechanically verified derivations  
- Philosophical positions are grounded in explicit axiom systems
- Public debate centers on logical validity rather than rhetoric
- Important ideas survive attempts at suppression

---

## Real-World Examples

### Mathematical Foundations

```bash
# Create a package for basic mathematical definitions
apm init SetTheory
echo 'module SetTheory.ZFC where

-- Axiom of Extensionality
postulate extensionality : {A B : Set} → (A → B) → (B → A) → A ≡ B

-- Define membership relation
postulate _∈_ : Set → Set → Set
' > SetTheory/ZFC.agda

apm pack
# → SetTheory@abc123...
```

### Building on Others' Work

```bash
# Use someone else's mathematical foundations
echo "SetTheory@abc123..." >> deps.txt
echo "BasicLogic@def456..." >> deps.txt
apm install

# Now build higher-level mathematics
echo 'module MyMath.Analysis where

open import SetTheory.ZFC
open import BasicLogic.Propositions

-- Define real numbers building on set theory
-- ... formal definitions ...
' > MyMath/Analysis.agda
```

### Anonymous Research Publication

```bash
# Publish controversial but formally verified research
apm init ControversialClaim
# ... develop formal proofs ...
apm pack
# → ControversialClaim@xyz789...

# Publish anonymously to multiple registries
apm push registry1 ControversialClaim@xyz789...
apm push registry2 ControversialClaim@xyz789...
apm push backup-registry ControversialClaim@xyz789...
```

### Registry Mirroring

```bash
# Backup important packages from another registry
apm remote add source https://important-research.org
apm remote add backup https://my-backup.org

# Mirror specific packages
apm pull source ImportantTheorem@def456...
apm push backup ImportantTheorem@def456...

# Or mirror bulk packages
apm ls -r source | xargs -I {} apm pull source {}
apm ls | xargs -I {} apm push backup {}
```

---

## Documentation

### User Guides
- **[USER_GUIDE.md](USER_GUIDE.md)** - Complete CLI reference, dependency management, and server setup
- **[docs/git.md](docs/git.md)** - Using Git with APM projects

### Technical Documentation  
- **[TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md)** - Package format, registry internals, and vetting process

### Philosophy and Design
- **[PHILOSOPHY.md](PHILOSOPHY.md)** - Core principles and vision for logic-based discourse
- **[DESIGN_PHILOSOPHY.md](DESIGN_PHILOSOPHY.md)** - How philosophical goals translate to technical decisions
- **[docs/deterministic-ids.md](docs/deterministic-ids.md)** - Deep dive on content-addressed package IDs
- **[docs/why-agda.md](docs/why-agda.md)** - Why Agda is the right foundation
- **[docs/future.md](docs/future.md)** - Roadmap and future directions

---

## Contributing

APM is an open source project aimed at creating infrastructure for logic-based discourse. We welcome contributions in several areas:

### Code Contributions
- **CLI improvements**: Better user experience, additional commands
- **Registry server**: Performance, security, additional endpoints
- **Tooling integration**: Editor plugins, CI/CD support

### Ecosystem Development
- **Package creation**: Mathematical libraries, logical frameworks
- **Registry hosting**: Running public registries for specific domains
- **Documentation**: Tutorials, examples, best practices

### Research and Design
- **Formal verification**: New approaches to automated proof checking
- **Discourse protocols**: Better mechanisms for collaborative reasoning
- **Decentralized systems**: Improvements to resilience and performance

### Getting Started

1. **Fork the repository** and clone locally
2. **Install dependencies**: `npm install` in `software/client/`, `software/server/`, and `software/common/`
3. **Run tests**: `npm test` in each package
4. **Submit pull requests** with clear descriptions

### Philosophy-Driven Development

When contributing, consider how your changes support APM's core goals:
- Does this make logical discourse more accessible?
- Does this preserve anonymity and decentralization?
- Does this encourage rigorous formal reasoning?
- Does this improve resilience against suppression?

---

## License

MIT License. See [`LICENSE`](LICENSE) for details.

---

## Community

APM represents an experiment in using formal methods to improve public discourse. Whether you're interested in:

- **Mathematics**: Building formal foundations and proof libraries
- **Philosophy**: Exploring logic-based argumentation 
- **Politics**: Creating transparent, verifiable policy analysis
- **Science**: Formal modeling and verification of scientific claims
- **Technology**: Decentralized systems and content addressing

...you'll find something valuable in the APM ecosystem.

The future of truth-seeking may well depend on our ability to move beyond identity-based discourse toward systems that reward logical validity, explicit assumptions, and rigorous reasoning. APM is one step in that direction.

**Join us in building the infrastructure for a more logical world.**
