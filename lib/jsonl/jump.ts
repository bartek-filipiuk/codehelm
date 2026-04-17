import type { JsonlEvent } from './types';

function extractTimestampMs(ev: JsonlEvent | undefined): number | null {
  const ts = (ev as { timestamp?: unknown })?.timestamp;
  if (typeof ts !== 'string') return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

const DURATION_RE = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i;

function parseDurationMs(raw: string): number | null {
  const m = raw.trim().match(DURATION_RE);
  if (!m || !m[0]) return null;
  const [, h, mm, s] = m;
  if (!h && !mm && !s) return null;
  return ((+(h ?? 0) * 60 + +(mm ?? 0)) * 60 + +(s ?? 0)) * 1000;
}

/**
 * Resolve a user query to an event index in `events`, or null if unresolvable.
 * Accepted forms:
 *   - bare integer (1-based): `42` → index 41 (clamped to range).
 *   - duration offset: `5m`, `1h30m`, `90s`, `1h2m3s` → first event whose
 *     timestamp ≥ firstTimestamp + offset.
 * Unknown shapes return null.
 */
export function parseJumpQuery(query: string, events: JsonlEvent[]): number | null {
  const q = query.trim();
  if (!q || events.length === 0) return null;

  if (/^\d+$/.test(q)) {
    const oneBased = parseInt(q, 10);
    if (oneBased < 1) return 0;
    return Math.min(oneBased - 1, events.length - 1);
  }

  const offsetMs = parseDurationMs(q);
  if (offsetMs == null) return null;

  let firstTs: number | null = null;
  for (const ev of events) {
    const ts = extractTimestampMs(ev);
    if (ts != null) {
      firstTs = ts;
      break;
    }
  }
  if (firstTs == null) return null;

  const target = firstTs + offsetMs;
  for (let i = 0; i < events.length; i++) {
    const ts = extractTimestampMs(events[i]);
    if (ts != null && ts >= target) return i;
  }
  return events.length - 1;
}
