/**
 * Convert a `mm:ss` or `hh:mm:ss` timestamp into an ISO 8601 duration.
 * Google requires `duration` on VideoObject to be ISO 8601, not a display string.
 *
 * "12:30"    -> "PT12M30S"
 * "1:02:05"  -> "PT1H2M5S"
 */
export function toIsoDuration(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value.trim().split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return undefined;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) [hours, minutes, seconds] = parts as [number, number, number];
  else if (parts.length === 2) [minutes, seconds] = parts as [number, number];
  else if (parts.length === 1) [seconds] = parts as [number];
  else return undefined;

  const out = ['PT'];
  if (hours) out.push(`${hours}H`);
  if (minutes) out.push(`${minutes}M`);
  if (seconds || (!hours && !minutes)) out.push(`${seconds}S`);
  return out.join('');
}

/** Seconds represented by a `mm:ss` / `hh:mm:ss` timestamp. */
export function toSeconds(value: string): number | undefined {
  const parts = value.trim().split(':').map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
