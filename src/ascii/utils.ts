/**
 * Date: 2026-06-07
 * Desc: Provides monospace width and padding helpers for ASCII output
 */

export type MonospacePaddingMode = 'spaces' | 'tabs';

/**
 * Checks whether a code point is a zero-width combining mark
 * @param codePoint Unicode code point to test
 * @returns True when the code point renders with zero width
 */
function isCombiningCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

/**
 * Checks whether a code point renders as a full-width (two-column) glyph
 * @param codePoint Unicode code point to test
 * @returns True when the code point occupies two monospace columns
 */
function isFullWidthCodePoint(codePoint: number): boolean {
  if (codePoint < 0x1100) {
    return false;
  }

  return (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x3247 && codePoint !== 0x303f) ||
    (codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97c) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1b000 && codePoint <= 0x1b2ff) ||
    (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

/**
 * Computes the columns advanced by a tab at the current width
 * @param currentWidth Current monospace width before the tab
 * @param tabWidth Tab stop width
 * @returns Number of columns the tab advances
 */
function getTabStopAdvance(currentWidth: number, tabWidth: number): number {
  const normalizedTabWidth = Math.max(1, Math.round(tabWidth));
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

  for (const character of text) {
    if (character === '\t') {
      width += getTabStopAdvance(width, tabWidth);
      continue;
    }

    const codePoint = character.codePointAt(0);

    if (codePoint === undefined || isCombiningCodePoint(codePoint)) {
      continue;
    }

    width += isFullWidthCodePoint(codePoint) ? 2 : 1;
  }

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
