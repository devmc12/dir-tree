# Dir Tree Node Playground

`playground-node/` is a small Node.js reference that demonstrates the headless `dir-tree` features that run outside the browser. It is not published to npm.

It mirrors the browser `playground/` setup: it imports the public `dir-tree` entry points and maps them to the package source through TypeScript `paths`, so the code reads exactly like a real consumer.

## Run

From the repository root:

```bash
npm install
npm --prefix playground-node install
npm run start:playground-node
```

Or inside `playground-node/`:

```bash
npm install
npm start
```

## Demos

`src/main.ts` runs each demo in sequence:

1. Read a real directory path with `NodeFileSystemAdapter` (`@devmc12/dir-tree/node`)
2. Parse imported ASCII tree text with `parseImportedTreeText` (`@devmc12/dir-tree/parser`)
3. Generate annotations through a mock `AnnotationProvider` and render annotated ASCII (`@devmc12/dir-tree/annotations`)
4. Create, rename, and filter visibility of tree nodes (`@devmc12/dir-tree/tree`)
5. Export and re-import a tree as JSON (`@devmc12/dir-tree/transfer`)

## Scope

This playground is intentionally minimal. It uses only Node built-ins plus `tsx` and TypeScript. Browser-only capabilities such as the directory picker and drag-and-drop source resolution live in `playground/`, not here.
