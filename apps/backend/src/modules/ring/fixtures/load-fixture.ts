import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Raw bytes of a recorded Ring payload under ./fixtures (test helper). */
export function fixture(name: string): Buffer {
  return readFileSync(join(__dirname, `${name}.json`));
}
