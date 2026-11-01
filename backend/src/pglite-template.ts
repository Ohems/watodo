/**
 * Holds the pre-migrated PGlite database snapshot in test mode. The Vitest
 * global setup (tests/global-setup.ts) builds the snapshot once per test run
 * and provides it to every worker via provide(); tests/setup.ts retrieves it
 * with inject() and stores it here before importing database.ts, which reads
 * it via getPgliteTemplate() when creating the PGlite instance. No files are
 * involved: the snapshot is passed to workers as a Uint8Array.
 */
let pgliteTemplate: Uint8Array<ArrayBuffer> | undefined;

export function setPgliteTemplate(template: Uint8Array<ArrayBuffer>): void {
  pgliteTemplate = template;
}

export function getPgliteTemplate(): Uint8Array<ArrayBuffer> | undefined {
  return pgliteTemplate;
}
