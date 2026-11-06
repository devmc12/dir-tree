/**
 * Date: 2026-11-07
 * Desc: Bounds the filesystem operations scheduled by one reader invocation
 */

export type RunReadIo = <T>(operation: () => Promise<T>) => Promise<T>;

/**
 * Creates a FIFO limiter for leaf operations that never schedule nested work
 * @param limit Validated maximum number of active operations
 * @returns Scheduler that hands a released slot to the next waiter
 */
export function createReadIoScheduler(limit: number): RunReadIo {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async operation => {
    if (active === limit) {
      await new Promise<void>(resolve => waiting.push(resolve));
    } else {
      active += 1;
    }

    try {
      return await operation();
    } finally {
      const next = waiting.shift();

      if (next) {
        next();
      } else {
        active -= 1;
      }
    }
  };
}
