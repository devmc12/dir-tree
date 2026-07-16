<!-- prettier-ignore-start -->

<div align="center">

# Dir Tree

### 面向浏览器与 Node.js 应用的 Headless 目录树工具集

[![npm version](https://img.shields.io/npm/v/@devmc12/dir-tree.svg)](https://www.npmjs.com/package/@devmc12/dir-tree)
[![npm downloads](https://img.shields.io/npm/dm/@devmc12/dir-tree.svg)](https://www.npmjs.com/package/@devmc12/dir-tree)
[![License](https://img.shields.io/npm/l/@devmc12/dir-tree.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/@devmc12/dir-tree.svg)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

[English](./README.md) | **简体中文**

</div>

<!-- prettier-ignore-end -->

`dir-tree` 能把本地目录、ZIP 包、GitHub/GitLab 仓库、粘贴的树文本或内存数据，转换为稳定的 `FileNode` 树，并支持将其渲染为 ASCII、编辑、注释和导出。核心是纯函数且与运行时无关，同一套逻辑在 Node.js 和浏览器中都能运行，且不带任何 UI 依赖。

> 本包是 [dir-tree.com](https://dir-tree.com/) 的 headless 版本，可在该站点体验完整应用。

![Dir Tree Overview](https://dir-tree.com/images/share/dir-tree-overview.png)

## 特性

- **多种数据源** —— 通过统一的适配器接口读取本地目录、ZIP 包、GitHub/GitLab 仓库、导入文本或内存树
- **可配置的 ASCII 渲染** —— 连接符风格、缩进、行号、完整路径，以及文件大小 / 修改时间元数据
- **纯函数式树编辑** —— 创建、重命名、移动、删除、聚焦、可见性与展开等操作返回新树，不修改你的状态
- **导入与导出** —— 解析 JSON、XML、HTML、Markdown 或 ASCII 树文本，并导出回 JSON 或 ASCII
- **注释** —— 与具体 provider 无关的请求 / diff / patch 辅助函数，支持逐节点注释；AI 或手动流程自行接入
- **同构且模块化** —— 支持 tree-shaking 的子路径导出，提供 ESM、CommonJS 与类型声明，可在 Node.js 与浏览器中运行

## 安装

```bash
npm install @devmc12/dir-tree
```

环境要求：

- Node.js `>=18.18`
- TypeScript 用户可直接从包中导入类型
- 核心与大部分适配器是同构的。Node.js 文件系统读取从 `@devmc12/dir-tree/node` 导出，浏览器专用 API 从 `@devmc12/dir-tree/browser` 导出

## 快速开始

```ts
import { FileSystemReader, InMemoryFileTreeAdapter } from '@devmc12/dir-tree';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';

const reader = new FileSystemReader(
  new InMemoryFileTreeAdapter({
    name: 'project',
    path: 'project',
    kind: 'directory',
    children: [
      {
        name: 'src',
        path: 'project/src',
        kind: 'directory',
        children: [
          {
            name: 'index.ts',
            path: 'project/src/index.ts',
            kind: 'file',
          },
        ],
      },
    ],
  })
);

const tree = await reader.read({
  depth: 3,
  exclude: ['node_modules', 'dist'],
  sort: { sortBy: 'name', order: 'asc', foldersFirst: true },
});

console.log(renderAsciiTree(tree));
```

## 数据源读取

### 内存树

当应用已经持有树形数据，或需要确定性的测试时，使用 `InMemoryFileTreeAdapter`。

```ts
import { FileSystemReader, InMemoryFileTreeAdapter } from '@devmc12/dir-tree';

const tree = await new FileSystemReader(
  new InMemoryFileTreeAdapter({
    name: 'docs',
    path: 'docs',
    kind: 'directory',
    children: [{ name: 'api.md', path: 'docs/api.md', kind: 'file' }],
  })
).read();
```

### Node.js 目录路径

使用 `@devmc12/dir-tree/node` 的 `NodeFileSystemAdapter` 可以在 Node.js 中读取磁盘上的目录路径。它遵循同样的 `depth`、`exclude`、`useGitignore`、`readFileMeta` 与 `sort` 选项，并与浏览器入口隔离，打包器不会把 `node:fs` 带入客户端构建。

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';

const tree = await new FileSystemReader(
  new NodeFileSystemAdapter('./my-project', {
    exclude: ['node_modules', 'dist'],
    useGitignore: true,
  })
).read({ readFileMeta: true });

console.log(renderAsciiTree(tree));
```

### 浏览器目录选择器

先用浏览器辅助函数检测目录选择器支持情况，再用 `LocalFileSystemAdapter` 读取。该能力仅限浏览器环境。

```ts
import { FileSystemReader, LocalFileSystemAdapter } from '@devmc12/dir-tree';
import { isNativeDirectoryPickerSupported } from '@devmc12/dir-tree/browser';

if (!isNativeDirectoryPickerSupported()) {
  throw new Error('当前环境不支持目录选择');
}

const handle = await window.showDirectoryPicker({ mode: 'read' });
const tree = await new FileSystemReader(
  new LocalFileSystemAdapter({}, handle)
).read({ readFileMeta: true, useGitignore: true });
```

对于不支持原生目录选择器、但支持传统 `webkitdirectory` 选择器的浏览器，可使用 `@devmc12/dir-tree/browser` 中的 `openLegacyDirectoryPicker` 和 `createLegacyDirectorySkipMatcher`，将排除规则下沉到目录遍历中。

```ts
import {
  FileSystemReader,
  LegacyDirectoryFilesAdapter,
} from '@devmc12/dir-tree';
import {
  createLegacyDirectorySkipMatcher,
  openLegacyDirectoryPicker,
} from '@devmc12/dir-tree/browser';

const skipDirectory = createLegacyDirectorySkipMatcher(
  ['node_modules', 'dist'],
  false
);
const files = await openLegacyDirectoryPicker({
  recursive: true,
  skipDirectory,
});
const tree = await new FileSystemReader(
  new LegacyDirectoryFilesAdapter(files, {})
).read();
```

### ZIP 文件

`ZipFileSystemAdapter` 支持 `Blob`、`ArrayBuffer` 或 `Uint8Array` 输入。

```ts
import { FileSystemReader, ZipFileSystemAdapter } from '@devmc12/dir-tree';

const response = await fetch('/fixtures/project.zip');
const tree = await new FileSystemReader(
  new ZipFileSystemAdapter(await response.arrayBuffer(), {}, 'project')
).read({ showHidden: false });
```

### 远程仓库

`RemoteRepositoryFileSystemAdapter` 用于读取 GitHub 或 GitLab 仓库树。当平台需要鉴权时传入 token，或注入自定义 API client 以便测试和自托管集成。

```ts
import {
  FileSystemReader,
  RemoteRepositoryFileSystemAdapter,
} from '@devmc12/dir-tree';

const tree = await new FileSystemReader(
  new RemoteRepositoryFileSystemAdapter({
    repositoryUrl: 'https://github.com/example/project/tree/main/src',
    token: 'github-token',
  })
).read({ depth: 4 });
```

内置 fetch client 会读取 GitHub/GitLab 的全部分支分页，以及 GitLab 仓库树的全部分页。GitHub 仓库树仍优先使用单次递归请求；当 GitHub 将响应标记为 truncated 时，client 会丢弃不完整数据，改为逐级展开完整子树。大型仓库可能消耗较多 API 配额，建议传入 token，或使用指向较小子目录的 tree URL。

远程仓库辅助函数从 `@devmc12/dir-tree/adapters` 导出，包括 URL 解析、ref/路径解析、分支解析、平台条目映射，以及 fetch client 创建。需要先加载默认分支与分支列表（例如填充分支下拉框）时，使用 `resolveRemoteRepositoryBranches`。

```ts
import { resolveRemoteRepositoryBranches } from '@devmc12/dir-tree/adapters';

const { branches, defaultBranch, ref, path } =
  await resolveRemoteRepositoryBranches({
    input: 'https://github.com/example/project/tree/main/src',
    token: 'github-token',
  });
```

## 解析与渲染

把导入的 JSON、XML、HTML、Markdown 列表、Markdown 文档或 ASCII 树文本解析为 `FileNode` 树，再渲染回 ASCII。

```ts
import { parseImportedTreeText } from '@devmc12/dir-tree/parser';
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
} from '@devmc12/dir-tree/ascii';

const parsed = parseImportedTreeText(
  `project
  ├── src
  └── README.md`,
  'project'
);

const ascii = renderAsciiTree(
  parsed.tree,
  createAsciiTreeOptionsFromConfig({
    connectorStyle: 'unicode',
    showLineNumbers: true,
  })
);
```

## 编辑树

树操作都是纯函数。它们返回克隆后的树或结构化的编辑结果，不会修改宿主 UI 状态。

```ts
import { createFileTreeNode, renameFileTreeNode } from '@devmc12/dir-tree/tree';

const created = createFileTreeNode(tree, 'project/src', {
  kind: 'file',
  name: 'new-file.ts',
});

const renamed = created
  ? renameFileTreeNode(created.tree, created.path, 'main.ts')
  : null;
```

## 导出与导入 JSON

当需要一个可序列化、包含可选注释与可见性状态的树文件时，使用 transfer 辅助函数。

```ts
import {
  createExportedFileTreeJson,
  parseImportedFileTreeJson,
} from '@devmc12/dir-tree/transfer';

const json = createExportedFileTreeJson(tree, annotations, { visibility });
const restored = parseImportedFileTreeJson(json);
```

## 注释 Provider 边界

本包不调用任何 AI 服务。它只定义 provider 请求载荷、provider 结果、补丁归一化与 diff 工具。模型调用、token、配额、存储、分析和通知都由你的应用负责。

```ts
import {
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
  createAnnotationProviderRequest,
  createTreeAnnotationPatchesFromProviderResult,
  type AnnotationProvider,
  type TreeAnnotationMap,
} from '@devmc12/dir-tree/annotations';

const provider: AnnotationProvider = {
  async annotate(payload) {
    return {
      annotations: payload.nodes.map(node => ({
        path: node.path,
        comment: `描述 ${node.kind}`,
      })),
    };
  },
};

const annotations: TreeAnnotationMap = {};
const request = createAnnotationProviderRequest({ tree, annotations });
const result = await provider.annotate(request.payload);
const patches = createTreeAnnotationPatchesFromProviderResult(
  result,
  request.sourcePaths
);
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

当数据源被再次读取时，可只保留仍匹配新树路径的注释，或将其整体重置。

```ts
import { resolveTreeAnnotationsAfterRead } from '@devmc12/dir-tree/annotations';

const retainedAnnotations = resolveTreeAnnotationsAfterRead(
  nextTree,
  annotations,
  'matching-paths'
);
```

## 项目结构

```
dir-tree/src
├── adapters                  # 文件数据源适配器：内存、Node.js、浏览器、ZIP 与远程仓库
│   └── remoteRepository      # GitHub/GitLab 仓库树的抓取与映射
├── annotations               # 注释 provider、补丁、diff、选项与带注释 ASCII
├── ascii                     # ASCII 树渲染、选项与等宽工具
├── browser                   # 可选的浏览器专用选择器与拖拽数据源辅助函数
├── node                      # Node.js 专用入口，暴露文件系统适配器
├── parser                    # 导入树文本解析器（JSON、XML、HTML、Markdown、ASCII）
├── reader                    # FileSystemReader、读取选项、元数据与 reader 工具
├── selection                 # 纯函数式的级联树选择模型
├── transfer                  # JSON 树导入/导出辅助函数
└── tree                      # 纯函数式的树编辑、可见性、展开、路径与统计工具
```

每个顶层目录都对应 `package.json#exports` 中的一个包子路径导出。

## Playground

GitHub 仓库包含 `playground/`，是一个简单的 Vite React 示例，通过本地 Vite 与 TypeScript 别名演示公开的 `dir-tree` 导入。它只是一个最小参考实现，并不完整。完整的应用请见 [dir-tree.com](https://dir-tree.com/)。

```bash
npm run dev:playground
npm run build:playground
```

Node.js 示例(无浏览器)见 `playground-node/`，演示 `NodeFileSystemAdapter`、解析、注释、树编辑与 JSON 传输：

```bash
npm run start:playground-node
```

## 文档

- [API 参考](https://github.com/devmc12/dir-tree/blob/main/docs/api.md)
- [适配器](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md)
- [注释](https://github.com/devmc12/dir-tree/blob/main/docs/annotations.md)
- [Playground](https://github.com/devmc12/dir-tree/blob/main/docs/playground.md)
- [发布清单](https://github.com/devmc12/dir-tree/blob/main/docs/release.md)

## 校验

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke:exports
npm run smoke:install
npm run pack:verify
npm --prefix playground run typecheck
npm run build:playground
```

`npm run smoke:install` 会打包本地包，将 tarball 安装到一个临时的消费者项目中，并验证 ESM、CommonJS 与 TypeScript 消费者导入。
