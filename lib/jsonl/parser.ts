import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { JsonlEvent } from './types';
import { logger } from '@/lib/server/logger';

export interface ParseOptions {
  /** Log malformed lines via pino (defaults to true). */
  logMalformed?: boolean;
}

/**
 * Streams a JSONL input, yielding validated events. Malformed lines are skipped
 * with a warn log (or silently when logMalformed: false).
 * Tolerates mixed CRLF/LF endings and trailing blank lines.
 */
export async function* parseJsonlStream(
  input: Readable,
  opts: ParseOptions = {},
): AsyncGenerator<JsonlEvent, void, void> {
  const logMalformed = opts.logMalformed !== false;
  const rl = createInterface({ input, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const raw of rl) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      if (logMalformed) {
        logger.warn({ lineNo, err: (err as Error).message }, 'jsonl_malformed');
      }
      continue;
    }
    const result = JsonlEvent.safeParse(parsed);
    if (!result.success) {
      if (logMalformed) {
        logger.warn({ lineNo, issues: result.error.issues }, 'jsonl_schema_violation');
      }
      continue;
    }
    yield result.data;
  }
}
