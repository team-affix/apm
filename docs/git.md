# Using Git with APM

Git is encouraged for tracking changes to your packages. APM is an adjacent tool for building and releasing versioned artifacts; you can initialize Git and APM in either order.

Track these in your repository:

- `deps.txt`
- `.agda-lib`
- `<ProjectName>/` (your root Agda source directory)

Recommended `.gitignore`:

```gitignore
*build*
deps
```

Typical workflow:

- Iterate and commit changes with Git
- Use `apm check` to typecheck locally
- Use `apm pack` to produce a content-addressed package and register it locally
- Use `apm package push <remote> <id>` to publish releases (full dependency tree)
