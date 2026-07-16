/**
 * Date: 2026-07-16
 * Desc: Normalizes npm pack JSON output across npm CLI versions
 */

/**
 * Parses the first package result from npm pack JSON output
 * @param {string} rawOutput Raw output returned by npm pack --json
 * @returns {{filename: string, files: Array<{path: string}>}} Normalized package result
 */
export function parseNpmPackResult(rawOutput) {
  const parsedOutput = JSON.parse(rawOutput);
  const packResults = Array.isArray(parsedOutput)
    ? parsedOutput
    : Object.values(parsedOutput);
  const packResult = packResults[0];

  if (
    !packResult ||
    typeof packResult !== 'object' ||
    typeof packResult.filename !== 'string' ||
    !Array.isArray(packResult.files)
  ) {
    throw new Error('npm pack did not return a valid package result');
  }

  return packResult;
}
