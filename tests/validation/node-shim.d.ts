// Minimal Node typings for the validation suite (no @types/node: not on the approved dependency list).
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
  export function writeFileSync(path: URL, data: string): void;
}
declare const process: { env: Record<string, string | undefined> };
