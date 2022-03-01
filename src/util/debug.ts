/* eslint-disable @typescript-eslint/no-explicit-any */
export function log(...args: any[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

export function warn(...args: any[]): void {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

export function error(...args: any[]): void {
  // eslint-disable-next-line no-console
  console.error(...args);
}

export function trace(...args: any[]): void {
  // eslint-disable-next-line no-console
  console.trace(...args);
}
