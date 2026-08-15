import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { Qualities } from '../core/qualities';
import { JsUnpacker } from '../utils/js_unpacker';

export class MixDrop extends ExtractorApi {
  name = 'MixDrop';
  mainUrl = 'https://mixdrop.co';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    const res = await http_get(url, referer ? { Referer: referer } : {});
    if (res.status !== 200) return [];

    const unpacked = JsUnpacker.unpack(res.body);
    const match = /wurl="(https?:[^"]+)"/.exec(unpacked);
    if (!match) return [];

    let finalUrl = match[1];
    if (finalUrl.startsWith('//')) {
      finalUrl = 'https:' + finalUrl;
    }

    return [{
      name: 'MixDrop',
      source: 'MixDrop',
      url: finalUrl,
      quality: Qualities.Unknown,
      type: 'video',
      headers: { Referer: this.mainUrl }
    }];
  }
}