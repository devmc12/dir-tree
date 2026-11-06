# Contributing

Thank you for helping improve Dir Tree.

## Development

Use Node.js 22 for repository development and tests. The installed package supports Node.js 18.18.1 and newer. Install dependencies, then run the core checks:

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run pack:dry
```

Run `npm run smoke:install` after building to check a temporary npm installation. Set `DIR_TREE_CONSUMER_NODE` to an absolute Node.js 18.18.1 executable path to run those runtime checks at the minimum version while compiling the consumer types with the development version. See [Reader benchmarks](docs/benchmarks.md) for the fixed performance fixtures.

## Code standards

- Keep the root `src` package headless
- Do not import React, Vite, Next.js, UI libraries, analytics, or playground code from `src`
- Keep comments in English
- Add tests for public behavior before exporting new APIs
- Prefer small domain modules over broad utility buckets

## Public API changes

New public exports should include:

- A stable name
- Unit tests
- README or API documentation
- A package export if they belong to a subpath

## Release checks

Before publishing, follow `docs/release.md`. The release checklist verifies the headless package boundary, installed package smoke tests, and playground build.
