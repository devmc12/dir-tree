import {
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

import { dictionaries, type PlaygroundLocale } from '../i18n';
import { useReaderContext } from './context';
import styles from './Reader.module.css';

export function ReaderToolbar() {
  const { dispatch, derived, state } = useReaderContext();
  const { copy } = derived;
  const TreeIcon = state.isTreePanelHidden ? PanelLeftOpen : PanelLeftClose;
  const ControlIcon = state.isControlPanelHidden
    ? PanelRightOpen
    : PanelRightClose;

  function setLocale(locale: PlaygroundLocale): void {
    dispatch({
      locale,
      status: {
        text: dictionaries[locale].status.loaded,
        tone: 'success',
      },
      type: 'set-locale',
    });
  }

  return (
    <header className={styles.toolbar}>
      <div className={styles.brandBlock}>
        <span className={styles.brandKicker}>
          npm install @devmc12/dir-tree
        </span>
        <h1>{copy.appTitle}</h1>
      </div>
      <div className={styles.toolbarActions}>
        <span className={`${styles.status} ${styles[state.status.tone]}`}>
          {state.isReading ? copy.status.reading : state.status.text}
        </span>
        <button
          className={styles.outlineButton}
          onClick={() => dispatch({ type: 'toggle-tree-panel' })}
          type="button">
          <TreeIcon aria-hidden="true" />
          {state.isTreePanelHidden
            ? copy.toolbar.showTree
            : copy.toolbar.hideTree}
        </button>
        <button
          className={styles.outlineButton}
          onClick={() => dispatch({ type: 'toggle-control-panel' })}
          type="button">
          <ControlIcon aria-hidden="true" />
          {state.isControlPanelHidden
            ? copy.toolbar.showControls
            : copy.toolbar.hideControls}
        </button>
        <div className={styles.segmented} aria-label={copy.toolbar.language}>
          <Languages aria-hidden="true" />
          {(['en', 'zh'] as const).map(locale => (
            <button
              aria-pressed={state.locale === locale}
              className={state.locale === locale ? styles.activeSegment : ''}
              key={locale}
              onClick={() => setLocale(locale)}
              type="button">
              {copy.locale[locale]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
