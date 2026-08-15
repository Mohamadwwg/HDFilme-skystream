export const Qualities = {
  Unknown: 400,
  P144: 144,
  P240: 240,
  P360: 360,
  P480: 480,
  P720: 720,
  P1080: 1080,
  P2160: 2160,
} as const;

export function qualityFromString(name: string | null): number {
  if (!name) return Qualities.Unknown;
  if (/4k/i.test(name)) return Qualities.P2160;
  return parseInt(name.replace(/p/i, '')) || Qualities.Unknown;
}
