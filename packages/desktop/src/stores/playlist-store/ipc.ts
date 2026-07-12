export const invokeIpc = window.api.invoke as (
  ...args: unknown[]
) => Promise<unknown>;
