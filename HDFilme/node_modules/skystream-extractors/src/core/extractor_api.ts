export interface IExtractorLink {
  source: string;
  name: string;
  url: string;
  referer?: string;
  quality?: number;
  type?: 'video' | 'm3u8' | 'dash';
  headers?: Record<string, string>;
  drmKid?: string;
  drmKey?: string;
  licenseUrl?: string;
}

export abstract class ExtractorApi {
  abstract readonly name: string;
  abstract readonly mainUrl: string;
  abstract readonly requiresReferer: boolean;

  abstract getUrl(url: string, referer?: string): Promise<IExtractorLink[]>;

  protected fixUrl(url: string): string {
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${this.mainUrl}${url}`;
    return `${this.mainUrl}/${url}`;
  }
}

declare global {
  function parse_html(html: string, selector: string, attribute?: string): Promise<any>;
}
