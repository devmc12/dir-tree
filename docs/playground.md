# Playground

`playground/` is a Vite + React demo for reading, editing, annotating, and exporting directory trees.

## Features

- Load a sample tree, choose a local folder or ZIP archive, or drag a folder or ZIP onto the page.
- Create, rename, and delete nodes; expand folders and control which nodes appear in the output.
- Add, edit, and remove node annotations.
- Configure read depth, exclusions, hidden files, `.gitignore`, metadata, and sorting, then apply the settings to reload the source.
- Customize ASCII connectors, indentation, labels, metadata, and annotation alignment.
- Copy text or download TXT, Markdown, and JSON.
- Switch between English and Chinese.

## Run

From the repository root:

```bash
npm install
npm --prefix playground install
npm run dev:playground
```

## Checks

From the repository root:

```bash
npm --prefix playground run typecheck
npm run build:playground
```

The read-option regression tests run through the Node playground:

```bash
npm --prefix playground-node install
npm --prefix playground-node run test:migration
```

## Source

The example imports the public `@devmc12/dir-tree` entry points. Vite aliases and TypeScript paths resolve these imports to the library source during local development.

- `playground/src/reader/`: panels, state, source reading, and export actions.
- `playground/src/i18n/`: English and Chinese text.
- `playground/src/fixtures.ts`: sample tree and annotations.

See the [Node playground](../playground-node/README.md) for command-line examples.
