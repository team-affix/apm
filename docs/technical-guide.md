# Technical Guide: APM Implementation Details

This document provides comprehensive technical details about APM's implementation, covering package format, registry internals, vetting processes, and system architecture.

---

## Table of Contents

- [Package Format and IDs](#package-format-and-ids)
- [Project Structure and Agda Constraints](#project-structure-and-agda-constraints)
- [Registry Architecture](#registry-architecture)
- [Vetting Process](#vetting-process)
- [Dependency Resolution](#dependency-resolution)
- [Data Model and Storage](#data-model-and-storage)
- [Network Protocol](#network-protocol)
- [Performance Considerations](#performance-considerations)

---

## Package Format and IDs

### Binary Package Structure

APM packages are single binary files with the following format:

```
Offset | Size    | Content
-------|---------|--------------------------------------------------
0x00   | 4 bytes | Package name length (uint32 little-endian)
0x04   | N bytes | Package name (UTF-8 string)
N+4    | 4 bytes | Direct dependencies length (uint32 little-endian)  
N+8    | M bytes | Direct dependencies (UTF-8 JSON array of package IDs)
N+M+8  | Rest    | Archive payload (tarball or zip of source files)
```

### Package ID Computation

Package IDs follow the format `PackageName@sha256hash`:

```typescript
function computePackageId(packageBytes: Buffer): string {
  // Read name length (first 4 bytes, little-endian)
  const nameLength = packageBytes.readUInt32LE(0);
  
  // Extract name (next nameLength bytes)
  const name = packageBytes.subarray(4, 4 + nameLength).toString('utf-8');
  
  // Compute SHA-256 over entire file
  const hash = crypto.createHash('sha256')
    .update(packageBytes)
    .digest('hex');
    
  return `${name}@${hash}`;
}
```

### Content Addressing Properties

**Deterministic**: Same byte sequence always produces the same ID.

**Tamper-evident**: Any modification changes the hash, creating a different ID.

**Collision-resistant**: SHA-256 makes it computationally infeasible to create two packages with the same ID.

**Decentralized**: No central authority needed to assign or verify IDs.

---

## Project Structure and Agda Constraints

### Standard Project Layout

```
MyProject/                    # Working directory
├── MyProject/                # Root source directory (package name)
│   ├── Core.agda            # Module: MyProject.Core
│   ├── Utils.agda           # Module: MyProject.Utils
│   ├── Advanced/
│   │   └── Logic.agda       # Module: MyProject.Advanced.Logic
│   └── README.md            # Documentation (optional)
├── .agda-lib                # Agda library configuration
├── deps.txt                 # Direct dependency list
└── deps/                    # Installed dependencies (auto-generated)
    ├── BasicLogic/          # Dependency: BasicLogic@hash123...
    └── SetTheory/           # Dependency: SetTheory@hash456...
```

### Agda Library Configuration

The `.agda-lib` file enforces sandboxing:

```
name: MyProject
include: . deps
```

This configuration:
- Makes only the project root (`.`) and dependencies (`deps`) visible to Agda
- Prevents access to global libraries or system-wide packages
- Ensures reproducible builds across different environments

### File Type Restrictions

Only these file types are allowed in the root source directory:
- **`.agda`**: Agda source files (required)
- **`.md`**: Markdown documentation (optional)

This restriction:
- Prevents executable code injection
- Keeps packages focused on logical content
- Simplifies security auditing

---

## Registry Architecture

### Storage Layout

Registries use a simple filesystem layout:

```
<registry-path>/
└── packages/
    ├── BasicLogic@a1b2c3d4e5f6...    # Package file
    ├── SetTheory@f6e5d4c3b2a1...     # Package file  
    └── MyProject@9z8y7x6w5v4u...     # Package file
```

### Registry Initialization

```typescript
class Registry {
  constructor(private readonly path: string) {}
  
  static async create(path: string): Promise<Registry> {
    // Create registry directory if it doesn't exist
    await fs.mkdir(path, { recursive: true });
    
    // Create packages subdirectory
    const packagesDir = join(path, 'packages');
    await fs.mkdir(packagesDir, { recursive: true });
    
    return new Registry(path);
  }
}
```

### Default Locations

- **Client registry**: `~/.apm/client/registry`
- **Server registry**: `~/.apm/server/registry`

These defaults can be overridden via environment variables or configuration.

---

## Vetting Process

### Registration Flow

When a package is registered (via `apm pack` or server `put`), it undergoes comprehensive vetting:

```typescript
async function vetPackage(pkg: Package, expectedId?: string): Promise<void> {
  // 1. Verify package ID integrity
  const computedId = pkg.computeId();
  if (expectedId && computedId !== expectedId) {
    throw new Error(`ID mismatch: expected ${expectedId}, got ${computedId}`);
  }
  
  // 2. Create temporary project from package
  const tempDir = await createTempProject(pkg);
  
  try {
    // 3. Validate file types in root source
    await validateFileTypes(tempDir);
    
    // 4. Resolve dependency tree
    const depTree = await resolveDependencies(pkg.directDeps);
    
    // 5. Install dependencies
    await installDependencies(tempDir, depTree);
    
    // 6. Typecheck with Agda
    await typecheckProject(tempDir);
    
    // 7. If all checks pass, store package
    await storePackage(pkg);
    
  } finally {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true });
  }
}
```

### File Type Validation

```typescript
async function validateFileTypes(projectDir: string): Promise<void> {
  const allowedExtensions = ['.agda', '.md'];
  const rootSourceDir = join(projectDir, pkg.name);
  
  for await (const file of walk(rootSourceDir)) {
    if (file.isFile()) {
      const ext = path.extname(file.name);
      if (!allowedExtensions.includes(ext)) {
        throw new Error(`Unexpected file type: ${file.path}`);
      }
    }
  }
}
```

### Typechecking Integration

```typescript
async function typecheckProject(projectDir: string): Promise<void> {
  // Find all .agda files in root source
  const agdaFiles = await glob('**/*.agda', { 
    cwd: join(projectDir, pkg.name) 
  });
  
  // Run Agda on each file
  for (const file of agdaFiles) {
    const result = await exec('agda', [file], { 
      cwd: projectDir,
      timeout: 30000  // 30 second timeout per file
    });
    
    if (result.exitCode !== 0) {
      throw new Error(`Typechecking failed for ${file}: ${result.stderr}`);
    }
  }
}
```

---

## Dependency Resolution

### Dependency Tree Construction

APM builds a forest of `PackageTree` structures to resolve dependencies:

```typescript
interface PackageTree {
  package: Package;
  dependencies: Map<string, PackageTree>;
  
  // Get packages in topological order for installation
  getTopologicalSort(): Package[];
}

async function getProjectTree(
  directDeps: Set<string>,
  overrides: Set<string> = new Set(),
  visited: Set<string> = new Set()
): Promise<PackageTree[]> {
  const trees: PackageTree[] = [];
  
  for (const depId of directDeps) {
    if (visited.has(depId)) continue;
    visited.add(depId);
    
    const pkg = await registry.get(depId);
    const tree = await buildPackageTree(pkg, overrides, visited);
    trees.push(tree);
  }
  
  return trees;
}
```

### Name-Based Override Resolution

When multiple packages have the same name, conflicts are resolved using these rules:

1. **Direct dependencies dominate**: If the root project declares a dependency with name `X`, that version is used throughout the project
2. **First-wins for peers**: If two transitive dependencies both depend on different packages named `X`, the first encountered wins
3. **Override detection**: If conflicts are detected, the system reports them and suggests adding direct dependencies to resolve them

```typescript
function resolvePeerConflicts(
  trees: PackageTree[], 
  overrides: Set<string>
): PackageTree[] {
  const nameToTree = new Map<string, PackageTree>();
  
  for (const tree of trees) {
    const existing = nameToTree.get(tree.package.name);
    
    if (existing) {
      if (existing.package.id !== tree.package.id) {
        if (!overrides.has(tree.package.name)) {
          throw new Error(
            `Peer dependency conflict for ${tree.package.name}: ` +
            `${existing.package.id} vs ${tree.package.id}`
          );
        }
      }
    } else {
      nameToTree.set(tree.package.name, tree);
    }
  }
  
  return Array.from(nameToTree.values());
}
```

### Installation Order

Dependencies are installed in topological order to ensure that each package's dependencies are available before it's processed:

```typescript
function getTopologicalSort(trees: PackageTree[]): Package[] {
  const visited = new Set<string>();
  const result: Package[] = [];
  
  function visit(tree: PackageTree) {
    if (visited.has(tree.package.id)) return;
    visited.add(tree.package.id);
    
    // Visit dependencies first
    for (const depTree of tree.dependencies.values()) {
      visit(depTree);
    }
    
    // Then add this package
    result.push(tree.package);
  }
  
  for (const tree of trees) {
    visit(tree);
  }
  
  return result;
}
```

---

## Data Model and Storage

### Package Class

```typescript
class Package {
  constructor(
    public readonly name: string,
    public readonly directDeps: string[],
    public readonly archiveBytes: Buffer
  ) {}
  
  get id(): string {
    return computePackageId(this.toBytes());
  }
  
  toBytes(): Buffer {
    const nameBytes = Buffer.from(this.name, 'utf-8');
    const depsJson = JSON.stringify(this.directDeps);
    const depsBytes = Buffer.from(depsJson, 'utf-8');
    
    const result = Buffer.allocUnsafe(
      4 + nameBytes.length + 4 + depsBytes.length + this.archiveBytes.length
    );
    
    let offset = 0;
    
    // Write name length and name
    result.writeUInt32LE(nameBytes.length, offset);
    offset += 4;
    nameBytes.copy(result, offset);
    offset += nameBytes.length;
    
    // Write deps length and deps
    result.writeUInt32LE(depsBytes.length, offset);
    offset += 4;
    depsBytes.copy(result, offset);
    offset += depsBytes.length;
    
    // Write archive
    this.archiveBytes.copy(result, offset);
    
    return result;
  }
  
  static fromBytes(bytes: Buffer): Package {
    let offset = 0;
    
    // Read name
    const nameLength = bytes.readUInt32LE(offset);
    offset += 4;
    const name = bytes.subarray(offset, offset + nameLength).toString('utf-8');
    offset += nameLength;
    
    // Read dependencies  
    const depsLength = bytes.readUInt32LE(offset);
    offset += 4;
    const depsJson = bytes.subarray(offset, offset + depsLength).toString('utf-8');
    const directDeps = JSON.parse(depsJson);
    offset += depsLength;
    
    // Read archive
    const archiveBytes = bytes.subarray(offset);
    
    return new Package(name, directDeps, archiveBytes);
  }
}
```

### Registry Operations

```typescript
class Registry {
  async get(id: string): Promise<Package> {
    const packagePath = join(this.path, 'packages', id);
    const bytes = await fs.readFile(packagePath);
    return Package.fromBytes(bytes);
  }
  
  async put(pkg: Package, expectedId?: string): Promise<void> {
    // Vet package before storing
    await this.vet(pkg, expectedId);
    
    // Store package file
    const packagePath = join(this.path, 'packages', pkg.id);
    await fs.writeFile(packagePath, pkg.toBytes());
  }
  
  async ls(filterIds?: string[]): Promise<string[]> {
    const packagesDir = join(this.path, 'packages');
    const entries = await fs.readdir(packagesDir);
    
    if (filterIds) {
      return entries.filter(id => filterIds.includes(id));
    }
    
    return entries;
  }
  
  async getPackageTree(rootId: string): Promise<PackageTree> {
    const pkg = await this.get(rootId);
    return await this.buildPackageTree(pkg, new Set(), new Set());
  }
}
```

---

## Network Protocol

### Server API

The APM server exposes a simple tRPC-based API:

```typescript
const router = trpc.router({
  get: trpc.procedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ b64: z.string() }))
    .query(async ({ input }) => {
      const pkg = await registry.get(input.id);
      const b64 = pkg.toBytes().toString('base64');
      return { b64 };
    }),
    
  put: trpc.procedure
    .input(z.object({ id: z.string(), b64: z.string() }))
    .output(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const bytes = Buffer.from(input.b64, 'base64');
      const pkg = Package.fromBytes(bytes);
      await registry.put(pkg, input.id);
      return { id: pkg.id };
    }),
    
  ls: trpc.procedure
    .input(z.object({ ids: z.array(z.string()) }))
    .output(z.object({ ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      const existingIds = await registry.ls(input.ids);
      return { ids: existingIds };
    }),
    
  getPullDependencies: trpc.procedure
    .input(z.object({ rootId: z.string() }))
    .output(z.object({ pkgIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const tree = await registry.getPackageTree(input.rootId);
      const pkgIds = tree.getTopologicalSort().map(pkg => pkg.id);
      return { pkgIds };
    })
});
```

### Client Operations

```typescript
class RegistryClient {
  constructor(private readonly apiUrl: string) {}
  
  async pull(rootId: string): Promise<void> {
    // Get dependency tree from remote
    const { pkgIds } = await this.api.getPullDependencies.query({ rootId });
    
    // Fetch each package and store locally
    for (const id of pkgIds) {
      const { b64 } = await this.api.get.query({ id });
      const bytes = Buffer.from(b64, 'base64');
      const pkg = Package.fromBytes(bytes);
      await localRegistry.put(pkg, id);
    }
  }
  
  async push(rootId: string): Promise<void> {
    // Get local dependency tree
    const tree = await localRegistry.getPackageTree(rootId);
    const packages = tree.getTopologicalSort();
    
    // Push each package to remote
    for (const pkg of packages) {
      const b64 = pkg.toBytes().toString('base64');
      await this.api.put.mutate({ id: pkg.id, b64 });
    }
  }
}
```

### Health Check Endpoint

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});
```

---

## Performance Considerations

### Caching Strategies

**Package Metadata Caching**: Cache package metadata (name, dependencies) separately from archive data for faster dependency resolution.

**Dependency Tree Caching**: Cache resolved dependency trees to avoid recomputation for repeated operations.

**Typecheck Result Caching**: Cache typechecking results based on package content hash to avoid re-typechecking identical packages.

### Optimization Techniques

**Parallel Typechecking**: Typecheck independent packages in parallel during vetting.

**Incremental Dependency Resolution**: Only re-resolve dependency subtrees when dependencies change.

**Streaming Archive Extraction**: Stream archive extraction for large packages to reduce memory usage.

### Resource Limits

**Vetting Timeouts**: Impose time limits on typechecking to prevent DoS attacks.

**Package Size Limits**: Limit maximum package size to prevent storage exhaustion.

**Dependency Depth Limits**: Limit maximum dependency tree depth to prevent cycle attacks.

---

## Security Considerations

### Input Validation

**Package Format Validation**: Strictly validate package binary format to prevent buffer overflows.

**Dependency ID Validation**: Validate package IDs match expected format and don't contain path traversal characters.

**Archive Validation**: Validate archive contents don't contain symlinks or files outside expected paths.

### Sandboxing

**Temporary Directory Isolation**: Use isolated temporary directories for vetting operations.

**Process Isolation**: Run Agda typechecking in separate processes with resource limits.

**Network Isolation**: Prevent vetting processes from making network requests.

### Resource Protection

**Rate Limiting**: Limit request rates to prevent DoS attacks.

**Storage Quotas**: Implement storage quotas per registry to prevent disk exhaustion.

**Memory Limits**: Impose memory limits on vetting processes.

---

## Monitoring and Debugging

### Logging

APM includes structured logging for:
- Package registration attempts and results
- Vetting process steps and timing
- Network operations and errors
- Registry operations and performance

### Metrics

Key metrics to monitor:
- Vetting success/failure rates
- Typechecking duration per package
- Registry storage usage
- Network operation latency

### Debugging Tools

**Package Inspection**: Tools to examine package binary format and metadata.

**Dependency Visualization**: Tools to visualize dependency trees and conflicts.

**Vetting Replay**: Ability to replay vetting process for debugging failures.

---

This technical guide provides the foundation for understanding, implementing, and extending APM. The system is designed to be simple enough to audit and implement while being robust enough to support the long-term vision of logic-based discourse.