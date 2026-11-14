# Dir Tree Node Playground

Node.js examples of reading, parsing, annotating, editing, and exporting directory trees.

## Run

From the repository root:

```bash
npm install
npm --prefix playground-node install
npm run start:playground-node
```

## Examples

`src/main.ts` runs five examples:

1. Read a local directory with `NodeFileSystemAdapter`.
2. Parse ASCII tree text with `parseImportedTreeText`.
3. Generate sample annotations with a mock `AnnotationProvider` and render annotated ASCII.
4. Create and rename nodes, and filter the tree by visibility.
5. Export a tree as JSON and import it again.

The examples import public `@devmc12/dir-tree` entry points, resolved to local library source through TypeScript paths.

## Checks

From the repository root:

```bash
npm run typecheck:playground-node
npm --prefix playground-node run test:migration
```

`test:migration` checks the browser playground's read-option refresh behavior, including clearing exclusions and changing depth or hidden-file settings.
