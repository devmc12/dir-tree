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

/**
 * Runs async tasks with a bounded concurrency limit
 * @param tasks Task factories to execute
 * @param limit Maximum number of tasks running at once
 * @returns Task results in their original order
 */
export async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let index = 0;

  /**
   * Runs tasks from the shared queue until no tasks remain
   */
  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index;
      const task = tasks[currentIndex];
      index += 1;

      if (!task) {
        continue;
      }

      results[currentIndex] = await task();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );

  return results;
}
