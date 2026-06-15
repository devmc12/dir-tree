import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { FileNode } from '@devmc12/dir-tree';
import type { AsciiTreeLine } from '@devmc12/dir-tree/ascii';
import type { FileTreeReadStats } from '@devmc12/dir-tree/tree';

import type { PlaygroundCopy } from '../i18n';
import type { ReaderState } from './state';
import type { ReaderTreeRow } from './types';
import type { readerReducer } from './state';

export interface ReaderDerivedState {
  annotationCount: number;
  asciiLines: AsciiTreeLine[];
  asciiText: string;
  copy: PlaygroundCopy;
  hasPendingReadOptions: boolean;
  rows: ReaderTreeRow[];
  selectedNode: FileNode;
  stats: FileTreeReadStats;
  visibleTree: FileNode;
}

export interface ReaderActions {
  applyReadOptions: () => Promise<void>;
  clearAnnotation: (path: string) => void;
  clearVisibility: () => void;
  collapseAll: () => void;
  commitAnnotation: (path: string) => void;
  copyAscii: () => Promise<void>;
  createNode: (path?: string) => void;
  deleteNode: (path?: string) => void;
  downloadJson: () => void;
  downloadMarkdown: () => void;
  downloadText: () => void;
  expandAll: () => void;
  hideChildren: (path?: string) => void;
  hideNode: (path?: string) => void;
  loadSample: () => Promise<void>;
  readDirectory: () => Promise<void>;
  readZipFile: (file: File) => Promise<void>;
  renameNode: (path?: string) => void;
  startAnnotation: (path: string) => void;
  startCreate: (path: string, kind?: FileNode['kind']) => void;
  startRename: (path: string, name: string) => void;
}

interface ReaderContextValue {
  actions: ReaderActions;
  derived: ReaderDerivedState;
  dispatch: Dispatch<Parameters<typeof readerReducer>[1]>;
  state: ReaderState;
}

const ReaderContext = createContext<ReaderContextValue | null>(null);

export function ReaderProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ReaderContextValue;
}) {
  return (
    <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>
  );
}

export function useReaderContext(): ReaderContextValue {
  const value = useContext(ReaderContext);

  if (!value) {
    throw new Error('Reader context is not available');
  }

  return value;
}

export function useReaderState(): ReaderState {
  return useReaderContext().state;
}

export function useReaderDerived(): ReaderDerivedState {
  return useReaderContext().derived;
}

export function useReaderActions(): ReaderActions {
  return useReaderContext().actions;
}

export function useReaderDispatch(): Dispatch<
  Parameters<typeof readerReducer>[1]
> {
  return useReaderContext().dispatch;
}
