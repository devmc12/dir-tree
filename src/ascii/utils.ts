import stringWidth from 'string-width';

/**
 * Date: 2026-06-07
 * Desc: Provides monospace width and padding helpers for ASCII output
 */

export type MonospacePaddingMode = 'spaces' | 'tabs';

// Printable ASCII and box-drawing connectors always occupy one terminal column
const NARROW_TREE_TEXT_PATTERN = /^[\x20-\x7e\u2500-\u257f]*$/u;

/**
 * Computes the columns advanced by a tab at the current width
 * @param currentWidth Current monospace width before the tab
 * @param tabWidth Tab stop width
 * @returns Number of columns the tab advances
 */
function getTabStopAdvance(currentWidth: number, tabWidth: number): number {
  const normalizedTabWidth = Number.isFinite(tabWidth)
    ? Math.max(1, Math.round(tabWidth))
    : 4;
  const tabRemainder = currentWidth % normalizedTabWidth;

  return tabRemainder === 0
    ? normalizedTabWidth
    : normalizedTabWidth - tabRemainder;
}

/**
 * Computes the monospace display width of text, accounting for wide and tab characters
 * @param text Text to measure
 * @param tabWidth Tab stop width used when expanding tabs
 * @returns Display width in monospace columns
 */
export function getMonospaceTextWidth(text: string, tabWidth = 4): number {
  let width = 0;

  text.split('\t').forEach((segment, index, segments) => {
    width += NARROW_TREE_TEXT_PATTERN.test(segment)
      ? segment.length
      : stringWidth(segment);

    if (index < segments.length - 1) {
      width += getTabStopAdvance(width, tabWidth);
    }
  });

  return width;
}

/**
 * Creates whitespace needed to reach a target monospace width
 * @param currentWidth Current display width
 * @param targetWidth Desired display width
 * @param mode Whether padding should prefer spaces or tabs
 * @param tabWidth Tab stop width
 * @returns Padding text
 */
function createMonospacePadding(
  currentWidth: number,
  targetWidth: number,
  mode: MonospacePaddingMode,
  tabWidth: number
): string {
  const remainingWidth = targetWidth - currentWidth;

  if (remainingWidth <= 0) {
    return '';
  }

  if (mode !== 'tabs') {
    return ' '.repeat(remainingWidth);
  }

  let padding = '';
  let paddedWidth = currentWidth;

  while (paddedWidth < targetWidth) {
    const tabAdvance = getTabStopAdvance(paddedWidth, tabWidth);

    if (paddedWidth + tabAdvance <= targetWidth) {
      padding += '\t';
      paddedWidth += tabAdvance;
      continue;
    }

    const spaceCount = targetWidth - paddedWidth;
    padding += ' '.repeat(spaceCount);
    paddedWidth += spaceCount;
  }

  return padding;
}

/**
 * Pads text on the right to reach a target monospace width
 * @param text Text to pad
 * @param targetWidth Desired monospace width
 * @param mode Whether to pad with spaces or tabs
 * @param tabWidth Tab stop width used when padding with tabs
 * @returns Text padded to the target width, or unchanged when already wide enough
 */
export function padMonospaceEnd(
  text: string,
  targetWidth: number,
  mode: MonospacePaddingMode = 'spaces',
  tabWidth = 4
): string {
  const currentWidth = getMonospaceTextWidth(text, tabWidth);

  if (currentWidth >= targetWidth) {
    return text;
  }

  return `${text}${createMonospacePadding(
    currentWidth,
    targetWidth,
    mode,
    tabWidth
  )}`;
}
