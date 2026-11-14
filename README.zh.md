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

在 Node.js 中使用时，需要 Node.js `>=18.18.1`。从 1.x 升级请阅读[迁移说明](https://github.com/devmc12/dir-tree/blob/main/docs/migrate-v2.md)。

```bash
npm install @devmc12/dir-tree
```

包内提供 TypeScript 类型声明。文件系统路径使用 `/node` 入口，浏览器目录 API 使用 `/browser` 入口。

## 快速开始

构造选项是默认值；`read(options)` 只覆盖本次读取。使用 `exclude: []` 清空默认排除项，保留适配器以便再次读取来源。

可以直接调用 `adapter.read()`，也可以使用 `FileSystemReader` 持有、切换适配器：

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

### 读取耗时

内置适配器可在每次成功读取后回调一次计时结果，`read()` 仍返回 `FileNode`：

```ts
const tree = await reader.read({
  onTiming: ({ prepareMs, treeMs, totalMs }) => {
    console.log({ prepareMs, treeMs, totalMs });
  },
});
```

单位为毫秒，分别表示来源准备、目录树处理及本次读取的总耗时。计时范围和回调行为见[读取耗时参考](https://github.com/devmc12/dir-tree/blob/main/docs/api.md#read-timing)。

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

使用 `@devmc12/dir-tree/node` 的 `NodeFileSystemAdapter` 读取磁盘上的目录路径。

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

先检测目录选择器支持情况，再在用户操作中用 `LocalFileSystemAdapter` 读取。适配器会保留已选择的句柄，刷新时无需再次选择。

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import {
  isNativeDirectoryPickerSupported,
  LocalFileSystemAdapter,
} from '@devmc12/dir-tree/browser';

if (!isNativeDirectoryPickerSupported()) {
  throw new Error('当前环境不支持目录选择');
}

const reader = new FileSystemReader(new LocalFileSystemAdapter());
const tree = await reader.read({ readFileMeta: true });
```

不支持原生目录选择器时，可使用[传统目录选择器适配器](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md#legacy-directory-files-adapter)。

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

适配器会读取分页结果并补全被截断的 GitHub 目录树。大型仓库可能需要较多 API 请求，可使用 token 或更小的子目录 URL。分支查询、自定义 client 和错误说明见[远程仓库适配器](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md#remote-repository-adapter)。

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

编辑之前渲染的文本时，使用 [`parseEditedAsciiTree`](https://github.com/devmc12/dir-tree/blob/main/docs/api.md#ascii-rendering) 并传入原始渲染基线。从 2.2.0 起，可通过 `detectRenames` 识别无歧义的根节点和同父级重命名。

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

## 注释

按节点路径保存注释，并渲染在目录树旁边：

```ts
import { renderAsciiTreeLines } from '@devmc12/dir-tree/ascii';
import {
  applyTreeAnnotationPatches,
  renderAnnotatedAsciiTree,
} from '@devmc12/dir-tree/annotations';

const annotations = applyTreeAnnotationPatches({}, [
  { path: 'project/src/index.ts', comment: '应用入口' },
]);
const output = renderAnnotatedAsciiTree(
  renderAsciiTreeLines(tree),
  annotations
);
```

需要生成注释时，实现 `AnnotationProvider`，再通过差异工具审核和应用结果。Provider 接入、对齐设置及重新读取后的注释保留见[注释文档](https://github.com/devmc12/dir-tree/blob/main/docs/annotations.md)。

## 项目结构

```
dir-tree/src
├── adapters                  # 文件数据源适配器：内存、Node.js、ZIP 与远程仓库
│   └── remoteRepository      # GitHub/GitLab 仓库树的抓取与映射
├── annotations               # 注释 provider、补丁、diff、选项与带注释 ASCII
├── ascii                     # ASCII 树渲染、选项与等宽工具
├── browser                   # 浏览器目录适配器、选择器与拖拽数据源辅助函数
├── node                      # Node.js 专用入口，暴露文件系统适配器
├── parser                    # 导入树文本解析器（JSON、XML、HTML、Markdown、ASCII）
├── reader                    # FileSystemReader、读取选项、元数据与 reader 工具
├── selection                 # 纯函数式的级联树选择模型
├── transfer                  # JSON 树导入/导出辅助函数
└── tree                      # 纯函数式的树编辑、可见性、展开、路径与统计工具
```

公开入口见 `package.json#exports`，通用读取 API 从包的主入口导入。

## Playground

通过[浏览器 Playground](https://github.com/devmc12/dir-tree/blob/main/docs/playground.md) 体验读取、编辑、注释和导出。在仓库根目录运行：

```bash
npm install
npm --prefix playground install
npm run dev:playground
```

[Node Playground](https://github.com/devmc12/dir-tree/blob/main/playground-node/README.md) 演示文件系统读取、解析、注释、编辑及 JSON 导入导出。

## 文档

- [架构与数据流](https://github.com/devmc12/dir-tree/blob/main/docs/architecture.md)
- [API 参考](https://github.com/devmc12/dir-tree/blob/main/docs/api.md)
- [从 1.x 迁移到 2.0](https://github.com/devmc12/dir-tree/blob/main/docs/migrate-v2.md)
- [适配器](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md)
- [注释](https://github.com/devmc12/dir-tree/blob/main/docs/annotations.md)
- [Playground](https://github.com/devmc12/dir-tree/blob/main/docs/playground.md)
- [发布清单](https://github.com/devmc12/dir-tree/blob/main/docs/release.md)

开发环境和测试命令见[贡献指南](https://github.com/devmc12/dir-tree/blob/main/CONTRIBUTING.md)。
