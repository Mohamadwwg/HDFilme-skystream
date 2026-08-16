import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { qualityFromString } from '../core/qualities';

export class HubCloud extends ExtractorApi {
  name = 'HubCloud';
  mainUrl = 'https://hubcloud.club';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    const res = await http_get(url, referer ? { Referer: referer } : {});
    if (res.status !== 200) return [];

    let finalPageBody = res.body;

    // Step 1: Check if there's a "Generate Direct Download Link" button
    const downloadBtn = await parse_html(res.body, 'a#download', 'href');
    if (downloadBtn && downloadBtn.length > 0 && downloadBtn[0].attr) {
      let nextUrl = downloadBtn[0].attr;
      if (nextUrl.startsWith('/')) {
        nextUrl = `https://${new URL(url).hostname}${nextUrl}`;
      }
      const nextRes = await http_get(nextUrl, { Referer: url });
      if (nextRes.status === 200) {
        finalPageBody = nextRes.body;
      }
    }

    // Step 2: Extract the actual download links from the final page
    const serverLinks = await parse_html(finalPageBody, 'a.btn', 'href');
    const results: IExtractorLink[] = [];

    for (const link of serverLinks) {
      const href = link.attr;
      const text = link.text || 'HubCloud Server';
      
      if (!href || href.startsWith('/') || href.includes('winexch') || href.includes('tinyurl')) continue;

      results.push({
        name: 'HubCloud',
        source: text.replace('Download', '').replace(/[\[\]]/g, '').trim() || 'HubCloud',
        url: href,
        quality: qualityFromString('Unknown'),
        type: 'video',
        headers: { Referer: this.mainUrl }
      });
    }

    return results;
  }
}