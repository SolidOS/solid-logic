/* eslint-disable @typescript-eslint/no-explicit-any */
export function log(...args: any[]): void {
  console.log(...args);
}

export function warn(...args: any[]): void {
  console.warn(...args);
}

export function error(...args: any[]): void {
  console.error(...args);
}

export function trace(...args: any[]): void {
  console.trace(...args);
}
