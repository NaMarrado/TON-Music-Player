/** Resolve the renderer bridge at call time, including after isolated test setup. */
export function invokeIpc(...args: unknown[]): Promise<unknown> {
  const invoke = window.api.invoke as (...values: unknown[]) => Promise<unknown>;
  return invoke(...args);
}
