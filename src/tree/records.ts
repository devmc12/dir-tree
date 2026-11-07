/**
 * Date: 2026-11-07
 * Desc: Stores arbitrary tree paths and ids without inherited object properties
 */

/** Creates an enumerable string-keyed map that also accepts __proto__ */
export function createPathMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** Reads only entries owned by the map, including caller-supplied plain objects */
export function getOwnValue<T>(
  map: Record<string, T>,
  key: string
): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}
