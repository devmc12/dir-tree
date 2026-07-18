# Annotations

`dir-tree` provides headless annotation utilities for directory trees. It can render annotations into ASCII output, parse edited annotations back from ASCII, normalize provider results, compute diffs, and apply accepted patches.

The package does not call AI providers. Applications own model requests, tokens, quotas, storage, analytics, and notifications.

## Data Model

Annotations are keyed by `FileNode.path`.

```ts
interface TreeAnnotation {
  path: string;
  comment: string;
  source: 'manual' | 'ai';
  syncStatus: 'local' | 'synced';
  updatedAt: number;
}

type TreeAnnotationMap = Record<string, TreeAnnotation>;

interface TreeAnnotationPatch {
  path: string;
  comment: string;
  source?: 'manual' | 'ai';
  syncStatus?: 'local' | 'synced';
  updatedAt?: number;
}
```

Patches are intentionally small. They represent a requested comment change for one path. The patch utilities fill default `source`, `syncStatus`, and `updatedAt` values when applying patches.

## Provider Boundary

Use `AnnotationProvider` as an application boundary. The provider receives a plain payload and returns patches. It can call OpenAI, Ollama, an internal API, a local rules engine, or a mock implementation.

```ts
interface AnnotationProvider {
  annotate: (
    payload: AnnotationRequestPayload,
    signal?: AbortSignal
  ) => Promise<AnnotationProviderResult>;
}
```

Example:

```ts
import {
  createAnnotationProviderRequest,
  createTreeAnnotationPatchesFromProviderResult,
  type AnnotationProvider,
} from '@devmc12/dir-tree/annotations';

const provider: AnnotationProvider = {
  async annotate(payload, signal) {
    const response = await fetch('/api/annotations', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });

    return await response.json();
  },
};

const request = createAnnotationProviderRequest({
  annotations,
  language: 'en',
  overwrite: false,
  prompt: 'Describe each directory in one short phrase',
  scope: 'visible',
  target: 'directories',
  tree,
  visibleTree,
});

const result = await provider.annotate(request.payload);
const patches = createTreeAnnotationPatchesFromProviderResult(
  result,
  request.sourcePaths
);
```

`request.payload` contains normalized `language`, trimmed `prompt`, `nodes`, and the selected `scope`, `target`, and `overwrite` flags so provider boundaries can stay stateless.

The core package does not know what `/api/annotations` is. That endpoint belongs to the host application.

## Diff And Apply Workflow

Create a diff before applying provider patches so a UI can review added, updated, and skipped entries.

```ts
import {
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
} from '@devmc12/dir-tree/annotations';

const diff = createAnnotationDiffResult(
  annotations,
  patches,
  request.allowedPaths
);

const nextAnnotations = applyTreeAnnotationPatches(
  annotations,
  diff.applyPatches
);
```

## Retention After Re-read

When a source is refreshed, a host application can reset annotations or retain only annotations whose paths still exist in the new tree.

```ts
import { resolveTreeAnnotationsAfterRead } from '@devmc12/dir-tree/annotations';

const nextAnnotations = resolveTreeAnnotationsAfterRead(
  nextTree,
  annotations,
  'matching-paths'
);
```

Retention modes:

- `reset`: drop all annotations
- `matching-paths`: keep annotations whose paths exist in the new tree

Diff groups:

- `added`: new comments for paths without existing comments
- `updated`: changed comments for paths with existing comments
- `skipped`: empty comments, unchanged comments, or paths outside the allowed scope

`removeAnnotationDiffEntry` can remove an individual diff entry before applying accepted patches.

## Annotated ASCII

Render annotations beside ASCII tree lines:

```ts
import { renderAsciiTreeLines } from '@devmc12/dir-tree/ascii';
import { renderAnnotatedAsciiTree } from '@devmc12/dir-tree/annotations';

const lines = renderAsciiTreeLines(tree);
const text = renderAnnotatedAsciiTree(lines, annotations, {
  alignmentMode: 'smart-column',
  commentPrefix: '#',
  commentColumn: 40,
});
```

Normalize UI or persisted annotation render settings with `createAnnotatedAsciiTreeRenderOptionsFromConfig`.

```ts
import { createAnnotatedAsciiTreeRenderOptionsFromConfig } from '@devmc12/dir-tree/annotations';

const options = createAnnotatedAsciiTreeRenderOptionsFromConfig({
  alignmentMode: 'whole-tree',
  commentPrefix: '//',
  commentPrefixHasSpace: true,
});
```

### Annotation Layout Strategies

`alignmentMode` keeps four stable mode identifiers. Let `C` be the preferred `commentColumn`, `G` be `gap`, and `W` be the terminal display width of one rendered tree line.

| Mode | Comment position |
| --- | --- |
| `smart-column` | Each annotated line uses `max(C, W + G)`. Long paths fall back independently and do not move other comments. |
| `whole-tree` | All annotated lines share `max(C, longest annotated W + G)`. |
| `folder-groups` | Annotated siblings under the same parent share `max(C, longest annotated W in that group + G)`. Each parent group is independent. |
| `inline` | Each comment follows its path at `W + G`, without column alignment. |

Only non-synthetic lines that actually have annotations participate in `whole-tree` and `folder-groups` width calculations. An unannotated long path therefore does not add whitespace to unrelated comments. Synthetic root lines are never annotated or measured for annotation alignment.

The preferred comment column defaults to `40`. The gap defaults to `2` and is normalized to a finite integer of at least `2`. Inline layout should set the gap explicitly:

```ts
const options = createAnnotatedAsciiTreeRenderOptionsFromConfig({
  alignmentMode: 'inline',
  gap: 2,
});
```

For backward compatibility, `alignmentMode: 'inline'` still treats an explicitly supplied `commentColumn` as the gap when `gap` is omitted. This legacy fallback is deprecated; new integrations should keep the aligned comment column and inline gap as separate settings. `rootCommentOffset` continues to shift aligned root targets and does not affect inline layout. In `smart-column`, a root whose own width plus gap exceeds the shifted preferred column still uses the long-line fallback, matching prior behavior.

Widths are measured as terminal columns. CJK and full-width characters occupy two columns, combining sequences occupy one rendered grapheme width, emoji sequences use their rendered terminal width, and tabs advance to four-column tab stops. This makes exported text deterministic in terminal-style monospace rendering. Browsers and Markdown editors can still show small pixel differences when their monospace font falls back to a different CJK or emoji font; that font-level behavior does not change the terminal column calculation.

Parse edited annotated ASCII back into patches:

```ts
import { parseAnnotatedAsciiTree } from '@devmc12/dir-tree/annotations';

const parsed = parseAnnotatedAsciiTree(lines, editedText, {
  commentTemplate: '# %comment%',
});
```

## Edited ASCII Diff

Use `createEditedAsciiAnnotationDiff` when users edit annotated ASCII text and a UI needs a review step before applying changes.

```ts
import {
  createEditedAsciiAnnotationDiff,
  parseAnnotatedAsciiTree,
} from '@devmc12/dir-tree/annotations';

const parsed = parseAnnotatedAsciiTree(lines, editedText, {
  commentTemplate: '# %comment%',
});
const diff = createEditedAsciiAnnotationDiff(
  parsed,
  editedText,
  lines,
  annotations
);
```

The result separates:

- `added`
- `updated`
- `removed`
- `ignored`
- `applyPatches`
- `ignoredLineNumbers`

Ignored lines are useful when the edited text contains comments that cannot be mapped back to a known tree path.

## Boundary Rules

Keep these responsibilities outside `dir-tree` core:

- prompt UI
- provider selection UI
- real model requests
- authentication and user tokens
- quota and billing
- toast notifications
- analytics
- storage
- product-specific API routes

Keep these responsibilities inside core:

- provider payload construction
- provider result normalization
- path-scoped patch filtering
- diff computation
- patch application
- annotated ASCII render and parse
