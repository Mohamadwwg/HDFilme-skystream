export function httpsify(url: string | null): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

export function imdbUrlToId(url: string | null): string | null {
  if (!url) return null;
  const match = /title\/(tt\d+)/.exec(url);
  return match ? match[1] : null;
}
