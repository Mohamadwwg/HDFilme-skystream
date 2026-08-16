import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { Qualities } from '../core/qualities';
import { JsUnpacker } from '../utils/js_unpacker';
import { M3u8Helper } from '../utils/m3u8_helper';

export class Filemoon extends ExtractorApi {
  name = 'Filemoon';
  mainUrl = 'https://filemoon.sx';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    const res = await http_get(url);
    if (res.status !== 200) return [];

    let body = res.body;
    if (body.includes('p,a,c,k,e,d')) {
      body = JsUnpacker.unpack(body);
    }

    const fileMatch = /file:\s*["']([^"']+\.m3u8[^"']*)["']/.exec(body);
    if (!fileMatch) return [];

    const m3u8Url = fileMatch[1];
    return await M3u8Helper.getM3U8Qualities(m3u8Url, { Referer: this.mainUrl });
  }
}