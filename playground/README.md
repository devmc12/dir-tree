# Dir Tree Playground

This directory contains the Vite React playground for the headless `dir-tree` package. It is a lightweight PC ReaderView reference implementation and is not published to npm.

The playground supports only English and Chinese UI dictionaries.

## Run locally

```bash
npm install
npm run dev
```

From the repository root, use:

```bash
npm run dev:playground
```

## Scope

The playground consumes the root package through the public `@devmc12/dir-tree` exports. It demonstrates:

- sample in-memory trees
- local directory reading when the browser supports directory picking
- ZIP reading
- tree editing, expansion, and visibility controls
- manual row annotations in the visual file tree
- read options and ASCII rendering options
- copy and download flows for ASCII, Markdown, and JSON
- lightweight `en` and `zh` UI dictionaries

The playground uses React + Vite, `useReducer` + Context, CSS Modules, and a small icon dependency. It intentionally does not include AI annotation, mock providers, ASCII edit/diff mode, focus mode, mobile drawers, Tailwind, SCSS, shadcn/radix, Zustand, Next.js, routes, backend services, analytics, or toast services.

Do not add package-only logic here. Reusable, UI-free logic belongs in the root `src` package modules.
