import type { DragEvent } from 'react';

import { useReaderDerived, useReaderState } from './context';
import { AsciiPanel } from './AsciiPanel';
import { ControlPanel } from './ControlPanel';
import styles from './Reader.module.css';
import { ReaderToolbar } from './ReaderToolbar';
import { TreePanel } from './TreePanel';

export function ReaderWorkspace({
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const state = useReaderState();
  const { copy } = useReaderDerived();

  return (
    <main
      className={`${styles.shell} ${state.isDragActive ? styles.dropActive : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}>
      <ReaderToolbar />
      <section className={styles.workspace}>
        {!state.isTreePanelHidden && <TreePanel />}
        <AsciiPanel />
        {!state.isControlPanelHidden && <ControlPanel />}
      </section>
      {state.isDragActive && (
        <div className={styles.dragOverlay} aria-hidden="true">
          <div>
            <strong>{copy.source.dropReadyTitle}</strong>
            <span>{copy.source.dropDescription}</span>
          </div>
        </div>
      )}
    </main>
  );
}
