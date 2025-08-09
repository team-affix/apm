# User Guide: Complete APM Reference

This guide covers everything you need to know to use APM effectively, from basic CLI commands to running your own registry server.

---

## Table of Contents

- [Installation and Setup](#installation-and-setup)
- [CLI Reference](#cli-reference)
- [Project Management](#project-management)
- [Package Operations](#package-operations)
- [Remote Registry Management](#remote-registry-management)
- [Dependency Management](#dependency-management)
- [Running a Registry Server](#running-a-registry-server)
- [Workflows and Best Practices](#workflows-and-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Installation and Setup

### Prerequisites

Before installing APM, ensure you have:

- **Node.js 18+** - Required for the CLI and server
- **Agda 2.6+** - Must be installed and available on PATH
- **Git** (recommended) - For version control of your projects

### Installing APM

Install the APM client globally:

```bash
npm install -g @team-affix/apm-client
```

This provides two binaries:
- **`apm`** - The main CLI for managing packages and projects
- **`apm-server`** - Registry server for hosting packages

### Verify Installation

Check that everything is working:

```bash
# Check APM version
apm --version

# Check Agda is available
agda --version

# Check server is available
apm-server --help
```

### First-Time Setup

APM will automatically create the necessary directories on first use:
- `~/.apm/client/registry` - Local package registry
- `~/.apm/client/remotes.json` - Remote registry configuration

---

## CLI Reference

### Command Structure

APM commands follow this pattern:
```bash
apm <category> <action> [arguments] [options]
```

### Top-Level Commands

- **`apm project`** - Manage the current project
- **`apm package`** - Query, pull, and push packages  
- **`apm remote`** - Manage remote registries

### Shorthand Commands

Common operations have shorthand versions:

| Shorthand | Full Command | Description |
|-----------|--------------|-------------|
| `apm init` | `apm project init` | Initialize project |
| `apm install` | `apm project install` | Install dependencies |
| `apm clean` | `apm project clean` | Clean dependencies |
| `apm check` | `apm project check` | Typecheck project |
| `apm pack` | `apm project pack` | Package project |
| `apm tree` | `apm project tree` | Show dependency tree |
| `apm info` | `apm package info` | Show package info |
| `apm ls` | `apm package ls` | List packages |
| `apm pull` | `apm package pull` | Pull packages |
| `apm push` | `apm package push` | Push packages |

---

## Project Management

### Creating a New Project

#### From Scratch

Create a new empty project:

```bash
mkdir my-logic-project
cd my-logic-project
apm init MyLogic
```

This creates:
```
MyLogic/          # Root source directory
├── .agda-lib     # Agda library configuration
├── deps.txt      # Dependency list (initially empty)
```

#### From an Existing Package

Bootstrap from an existing package:

```bash
mkdir my-project
cd my-project
apm init --pkg ExistingPackage@a1b2c3d4...
```

This extracts the package contents and sets up a new project based on it.

### Project Lifecycle Commands

#### Install Dependencies

Download and install all packages listed in `deps.txt`:

```bash
apm install
```

This:
1. Reads package IDs from `deps.txt`
2. Resolves the complete dependency tree
3. Downloads missing packages from local registry
4. Installs them in `deps/PackageName/` directories
5. Updates `.agda-lib` to include dependency paths

#### Clean Dependencies

Remove all installed dependencies:

```bash
apm clean
```

This removes the `deps/` directory. Use this to force a fresh dependency install.

#### Typecheck Project

Verify your project typechecks with Agda:

```bash
apm check
```

This runs `agda` on all `.agda` files in your root source directory.

#### Package Project

Create a package from your current project:

```bash
apm pack
```

This:
1. Creates a package file from your root source
2. Includes dependencies listed in `deps.txt`
3. Registers the package in your local registry
4. Prints the resulting package ID

#### View Dependency Tree

See the structure of your project's dependencies:

```bash
apm tree
```

Example output:
```
MyProject@a1b2c3d4...
├── BasicLogic@e5f6g7h8...
│   └── Foundations@i9j0k1l2...
└── SetTheory@m3n4o5p6...
    └── Foundations@i9j0k1l2...  # Same as above (shared)
```

---

## Package Operations

### Listing Packages

#### List Local Packages

```bash
# List all packages in local registry
apm ls

# Filter by specific IDs
apm ls BasicLogic@abc123 SetTheory@def456
```

#### List Remote Packages

```bash
# Check which packages exist on a remote
apm ls -r myremote BasicLogic@abc123 SetTheory@def456
```

### Package Information

Get detailed information about a package:

```bash
apm info BasicLogic@abc123
```

Example output:
```
Package: BasicLogic@abc123456789abcdef...
Path: /home/user/.apm/client/registry/packages/BasicLogic@abc123...
Name: BasicLogic
Dependencies: ["Foundations@def456789..."]
Archive Offset: 156 bytes
Size: 4.2 KB
```

### Pulling Packages

#### Pull Single Package with Dependencies

```bash
apm pull myremote BasicLogic@abc123
```

This downloads the package and its entire dependency tree from the remote registry.

#### Pull Multiple Packages

```bash
# Pull multiple specific packages
apm pull myremote BasicLogic@abc123 SetTheory@def456

# Pull all packages that exist on remote from a list
cat important-packages.txt | xargs apm pull myremote
```

### Pushing Packages

#### Push Single Package with Dependencies  

```bash
apm push myremote MyPackage@xyz789
```

This uploads the package and its entire dependency tree to the remote registry.

#### Push Multiple Packages

```bash
# Push specific packages
apm push myremote Package1@abc Package2@def

# Push all local packages
apm ls | xargs -I {} apm push myremote {}
```

### Dependency Trees

View the complete dependency tree for any package:

```bash
apm package tree BasicLogic@abc123
```

This works for packages you don't have locally—it queries the dependency structure without downloading content.

---

## Remote Registry Management

### Adding Remotes

Add a new remote registry:

```bash
apm remote add myregistry https://registry.example.org
```

By default, this performs a health check. To skip it:

```bash
apm remote add myregistry https://registry.example.org --skip-health-check
```

### Listing Remotes

See all configured remotes:

```bash
apm remote ls
```

Example output:
```
backup: https://backup.example.org
research: https://research-registry.org  
personal: https://my-packages.com
```

### Health Checks

Check if a remote registry is responding:

```bash
apm remote health myregistry
```

This hits the `/health` endpoint and reports the status.

### Removing Remotes

Remove a remote registry:

```bash
apm remote rm myregistry
```

This only removes it from your local configuration—it doesn't affect the remote server.

---

## Dependency Management

### Understanding Dependencies

APM uses a sophisticated dependency model designed for Agda's constraints:

#### Direct vs Transitive Dependencies

- **Direct dependencies**: Listed in your `deps.txt` file
- **Transitive dependencies**: Required by your direct dependencies

#### Name-Based Resolution

Since Agda requires unique top-level module names, APM resolves conflicts by package name:

- Only one package with a given name can exist in a project
- If multiple dependencies require different versions of the same name, you get a conflict
- Conflicts are resolved by adding direct dependencies to override transitive ones

### Dependency File Format

The `deps.txt` file lists direct dependencies, one per line:

```
BasicLogic@a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789
SetTheory@b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789a
CategoryTheory@c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab
```

### Adding Dependencies

#### Manual Method

Edit `deps.txt` and add the package ID:

```bash
echo "NewPackage@def456..." >> deps.txt
apm install
```

#### From Package Info

If you know a package exists:

```bash
# Find the exact ID
apm ls -r someremote | grep MyPackage
# Add it to deps.txt
echo "MyPackage@exacthash..." >> deps.txt
apm install
```

### Resolving Conflicts

#### Understanding Conflicts

You might see errors like:

```
Error: Peer dependency conflict for PackageName:
  BasicLogic@abc123 requires PackageName@version1
  SetTheory@def456 requires PackageName@version2
```

#### Resolution Strategy

1. **Choose your preferred version** of the conflicting package
2. **Add it as a direct dependency** in `deps.txt`
3. **Reinstall dependencies**

```bash
# Choose version1 as the winner
echo "PackageName@version1hash..." >> deps.txt
apm clean
apm install
```

### Override Examples

#### Example 1: Updating a Transitive Dependency

Suppose your dependency tree looks like:
```
MyProject
├── AlgebraUtils@abc123
│   └── BasicMath@old456  
└── GeometryUtils@def789
    └── BasicMath@old456     # You want to upgrade this
```

To use a newer version of `BasicMath`:

```bash
# Add the new version as a direct dependency
echo "BasicMath@new789..." >> deps.txt
apm clean && apm install
```

Result:
```
MyProject  
├── AlgebraUtils@abc123
├── GeometryUtils@def789
└── BasicMath@new789        # Now this version is used everywhere
```

#### Example 2: Using Alternative Implementations

You can swap implementations that provide the same interface:

```bash
# Replace StandardLogic with ConstructiveLogic
echo "ConstructiveLogic@alt123..." >> deps.txt
# Remove the old one if it was direct
# Edit deps.txt to remove StandardLogic@old456...
apm clean && apm install
```

### Dependency Best Practices

#### Keep deps.txt Minimal

Only list direct dependencies—packages your code actually imports. Let APM resolve transitive dependencies automatically.

#### Use Full Hashes

Always use complete SHA-256 hashes in `deps.txt`:
```bash
# Good
BasicLogic@a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789

# Bad - will fail
BasicLogic@a1b2c3
BasicLogic
```

#### Document Your Choices

If you override transitive dependencies, document why:

```bash
# deps.txt
BasicLogic@a1b2c3d4...
SetTheory@b2c3d4e5...
# Override: Using newer version of Foundations for security fix
Foundations@c3d4e5f6...
```

---

## Running a Registry Server

### Basic Server Setup

Start a registry server:

```bash
apm-server
```

By default, this:
- Starts on port 3000
- Uses `~/.apm/server/registry` for storage
- Exposes endpoints on `http://localhost:3000`

### Configuration Options

#### Port Configuration

```bash
# Use a different port
PORT=8080 apm-server

# Or set in environment
export PORT=8080
apm-server
```

#### Registry Path

```bash
# Use custom registry location
REGISTRY_PATH=/path/to/my/registry apm-server
```

### Server Endpoints

Your server exposes these endpoints:

#### Health Check
```
GET /health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### tRPC API
```
POST /api/trpc
```

Provides the following procedures:
- `get(id)` - Retrieve a package
- `put(id, data)` - Store a package
- `ls(ids)` - Check package presence
- `getPullDependencies(rootId)` - Get dependency tree

### Production Considerations

#### Reverse Proxy

Use nginx or similar for production:

```nginx
server {
    listen 80;
    server_name my-registry.example.org;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### SSL/TLS

Use Let's Encrypt or similar for HTTPS:

```bash
# Example with certbot
certbot --nginx -d my-registry.example.org
```

#### Process Management

Use systemd, pm2, or similar for process management:

```bash
# With pm2
pm2 start apm-server --name "apm-registry"
pm2 startup
pm2 save
```

#### Monitoring

Monitor these metrics:
- Registry storage usage
- Request rates and response times
- Vetting success/failure rates
- Package upload/download volumes

### Registry Policies

Individual registries can implement custom policies:

#### Content Filtering

You can modify the server to filter content:
- Reject packages containing certain keywords
- Require packages to pass additional checks
- Implement signature verification

#### Access Control

Add authentication/authorization:
- Require API keys for uploads
- Restrict downloads to authenticated users
- Implement package ownership models

#### Rate Limiting

Protect against abuse:
- Limit uploads per IP/user
- Throttle expensive operations
- Implement quotas on storage usage

---

## Workflows and Best Practices

### Development Workflow

#### 1. Starting a New Project

```bash
# Create project directory
mkdir formal-analysis
cd formal-analysis

# Initialize APM project
apm init FormalAnalysis

# Set up git (recommended)
git init
git add .
git commit -m "Initial APM project setup"

# Create initial content
cat > FormalAnalysis/Core.agda << 'EOF'
module FormalAnalysis.Core where

-- Your formal definitions here
data Proposition : Set where
  ⊤ : Proposition
  ⊥ : Proposition
EOF

# Verify it typechecks
apm check
```

#### 2. Adding Dependencies

```bash
# Research available packages
apm ls -r research-registry | grep Logic

# Add specific dependencies
echo "BasicLogic@abc123..." >> deps.txt
echo "SetTheory@def456..." >> deps.txt

# Install and verify
apm install
apm check
```

#### 3. Iterative Development

```bash
# Make changes to your Agda files
# ... edit FormalAnalysis/Core.agda ...

# Check your work
apm check

# Commit changes
git add .
git commit -m "Add proposition definitions"

# Package and test locally
apm pack
# → FormalAnalysis@xyz789...
```

#### 4. Publishing

```bash
# Push to multiple registries for resilience
apm push backup-registry FormalAnalysis@xyz789...
apm push main-registry FormalAnalysis@xyz789...
apm push personal-registry FormalAnalysis@xyz789...

# Tag the git commit
git tag v1.0.0
git push origin v1.0.0
```

### Collaboration Workflow

#### Setting Up Shared Dependencies

```bash
# Team agrees on a foundation registry
apm remote add foundation https://foundation-math.org

# Create project with shared foundation
apm init TeamProject
echo "SharedFoundations@agreed123..." >> deps.txt
apm install

# Verify everyone can typecheck
apm check
```

#### Sharing Work in Progress

```bash
# Push work-in-progress to shared development registry
apm pack
# → TeamProject@wip456...
apm push dev-registry TeamProject@wip456...

# Teammates can pull and test
apm pull dev-registry TeamProject@wip456...
```

### Anonymous Publishing Workflow

#### Operational Security

```bash
# Use Tor or VPN for network anonymity
# Avoid distinctive coding patterns
# Use temporary development environments

# Create anonymous package
apm init AnonymousTheorem
# ... develop formally verified content ...
apm pack
# → AnonymousTheorem@anon789...

# Publish to multiple independent registries
apm push registry1 AnonymousTheorem@anon789...
apm push registry2 AnonymousTheorem@anon789...
apm push registry3 AnonymousTheorem@anon789...
```

### Registry Mirroring Workflow

#### Personal Backup Strategy

```bash
# Mirror important packages to personal registry
apm remote add upstream https://important-research.org
apm remote add backup https://my-backup.org

# Sync specific package trees
apm pull upstream ImportantTheorem@key123...
apm push backup ImportantTheorem@key123...

# Automated backup script
#!/bin/bash
IMPORTANT_PACKAGES="
ImportantTheorem@key123
CriticalLemma@abc456
FoundationalAxioms@def789
"

for pkg in $IMPORTANT_PACKAGES; do
    echo "Backing up $pkg..."
    apm pull upstream "$pkg" 2>/dev/null || echo "Failed to pull $pkg"
    apm push backup "$pkg" 2>/dev/null || echo "Failed to push $pkg"  
done
```

### Git Integration

#### Recommended .gitignore

```gitignore
# APM-generated directories
deps/

# Agda build artifacts  
*.agdai
_build/

# Editor files
.vscode/
*.swp
*~

# OS files
.DS_Store
Thumbs.db
```

#### Tagging Releases

```bash
# After packaging
apm pack
# → MyPackage@release123...

# Tag the corresponding git commit
git tag "MyPackage@release123..."
git push origin --tags

# Document the release
echo "MyPackage@release123..." >> RELEASES.md
git add RELEASES.md
git commit -m "Record package release"
```

---

## Troubleshooting

### Common Issues

#### "Package not found" Errors

**Problem**: `apm pull` or `apm install` fails with package not found.

**Solutions**:
```bash
# Check if package exists locally
apm ls | grep PackageName

# Check if package exists on remote
apm ls -r remotename | grep PackageName

# Verify the exact package ID
apm info PackageName@hash...

# Try pulling from a different remote
apm pull different-remote PackageName@hash...
```

#### Dependency Conflicts

**Problem**: Peer dependency conflict errors during install.

**Solutions**:
```bash
# Identify conflicting packages
apm install  # Read the error message carefully

# Add direct dependency to resolve conflict
echo "ConflictedPackage@chosen-version..." >> deps.txt

# Clean and reinstall
apm clean
apm install
```

#### Typechecking Failures

**Problem**: `apm check` or `apm pack` fails during typechecking.

**Solutions**:
```bash
# Check Agda is properly installed
agda --version

# Verify .agda-lib is correct
cat .agda-lib

# Check for syntax errors in your files
agda MyProject/Core.agda

# Ensure dependencies are installed
apm install
ls deps/  # Should show dependency directories

# Try typechecking individual files
cd MyProject
agda Core.agda
```

#### Server Connection Issues

**Problem**: Cannot connect to remote registry.

**Solutions**:
```bash
# Test basic connectivity
curl https://registry.example.org/health

# Check registry configuration
apm remote ls

# Test with explicit health check
apm remote health registry-name

# Try different network (VPN issues)
# Check firewall/proxy settings
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug environment variable
export DEBUG=apm:*
apm install

# Or for specific operations
DEBUG=apm:pull apm pull registry PackageName@hash...
```

### Manual Registry Operations

#### Inspect Registry Contents

```bash
# Local registry location
ls ~/.apm/client/registry/packages/

# Count packages
ls ~/.apm/client/registry/packages/ | wc -l

# Find packages by name
ls ~/.apm/client/registry/packages/ | grep "^PackageName@"
```

#### Manual Package Management

```bash
# Backup registry
cp -r ~/.apm/client/registry ~/registry-backup

# Restore registry
rm -rf ~/.apm/client/registry
cp -r ~/registry-backup ~/.apm/client/registry

# Clean corrupted packages
rm ~/.apm/client/registry/packages/CorruptedPackage@hash...
```

### Performance Issues

#### Large Dependency Trees

For projects with many dependencies:

```bash
# Install dependencies in parallel (if supported)
apm install --parallel

# Use local caching
export APM_CACHE_DIR=/tmp/apm-cache
apm install

# Consider dependency tree optimization
apm tree  # Identify redundant dependencies
```

#### Slow Typechecking

For projects with slow typechecking:

```bash
# Typecheck individual modules
cd MyProject
agda --safe Core.agda

# Use Agda's parallel checking
agda -j4 Core.agda  # Use 4 cores

# Profile typechecking performance
agda --profile Core.agda
```

### Getting Help

#### Log Files

APM logs to:
- Console output (with `DEBUG=apm:*`)
- System logs (for server operations)

#### Community Resources

- Check project documentation: [docs/](docs/)
- File issues on the project repository
- Discuss on relevant forums or chat platforms

#### Debugging Information

When reporting issues, include:

```bash
# System information
apm --version
agda --version
node --version
uname -a

# APM configuration
apm remote ls
ls ~/.apm/client/registry/packages/ | wc -l

# Error reproduction steps
DEBUG=apm:* apm failing-command 2>&1 | tee debug.log
```

---

This user guide covers the essential knowledge for using APM effectively. Whether you're developing formal proofs, managing dependencies, or running your own registry, these tools and workflows will help you make the most of APM's capabilities.