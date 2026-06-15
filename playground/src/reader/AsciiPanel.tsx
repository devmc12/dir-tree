import { Copy, Download, FileCode2, FileJson, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createFileTreeDownloadFilename } from '@devmc12/dir-tree';

import { useReaderActions, useReaderContext } from './context';
import styles from './Reader.module.css';
import {
  copyText,
  createMarkdownDownloadText,
  downloadPlainText,
} from './utils';

export function AsciiPanel() {
  const actions = useReaderActions();
  const { derived, dispatch, state } = useReaderContext();
  const { annotationCount, asciiText, copy } = derived;
  const renderedText = asciiText || copy.emptyState;
  const [draftText, setDraftText] = useState(renderedText);
  const outputClassName = [
    styles.asciiOutput,
    state.asciiOptions.useMonospaceFont ? styles.monospaceOutput : '',
  ]
    .filter(Boolean)
    .join(' ');
  const draftLineCount = draftText.split('\n').filter(Boolean).length;

  useEffect(() => {
    setDraftText(renderedText);
  }, [renderedText]);

  async function handleCopyAscii(): Promise<void> {
    await copyText(draftText);
    dispatch({
      type: 'set-status',
      status: { text: copy.status.copied, tone: 'success' },
    });
  }

  function handleDownloadMarkdown(): void {
    downloadPlainText(
      createFileTreeDownloadFilename(state.tree, 'md'),
      createMarkdownDownloadText(draftText),
      'text/markdown'
    );
    dispatch({
      type: 'set-status',
      status: { text: copy.status.downloaded, tone: 'success' },
    });
  }

  function handleDownloadText(): void {
    downloadPlainText(
      createFileTreeDownloadFilename(state.tree, 'txt'),
      draftText
    );
    dispatch({
      type: 'set-status',
      status: { text: copy.status.downloaded, tone: 'success' },
    });
  }

  return (
    <section className={`${styles.panel} ${styles.asciiPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{copy.ascii.title}</h2>
          <p>
            {draftLineCount} {copy.ascii.lines} · {annotationCount}{' '}
            {copy.ascii.annotations} ·{' '}
            {copy.ascii.indentationOptions[state.asciiOptions.indentationStyle]}
          </p>
        </div>
        <div className={styles.buttonGroup}>
          <button onClick={handleCopyAscii} type="button">
            <Copy aria-hidden="true" />
            {copy.actions.copyAscii}
          </button>
          <button onClick={handleDownloadMarkdown} type="button">
            <FileCode2 aria-hidden="true" />
            {copy.actions.downloadMarkdown}
          </button>
          <button onClick={handleDownloadText} type="button">
            <FileText aria-hidden="true" />
            {copy.actions.downloadTxt}
          </button>
          <button onClick={actions.downloadJson} type="button">
            <FileJson aria-hidden="true" />
            {copy.actions.downloadJson}
          </button>
        </div>
      </div>
      <textarea
        aria-label={copy.ascii.title}
        className={outputClassName}
        onChange={event => setDraftText(event.target.value)}
        spellCheck={false}
        tabIndex={0}
        value={draftText}
        wrap="off"
      />
      <div className={styles.asciiFooter}>
        <Download aria-hidden="true" />
        <span>{copy.ascii.readonlyNotice}</span>
      </div>
    </section>
  );
}
