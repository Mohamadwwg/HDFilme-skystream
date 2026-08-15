import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { Qualities } from '../core/qualities';
import { JsHunter } from '../utils/js_hunter';

export class Voe extends ExtractorApi {
  name = 'Voe';
  mainUrl = 'https://voe.sx';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    const res = await http_get(url);
    if (res.status !== 200) return [];

    // Voe usually stores the master m3u8 in a script variable, often something like `var sources = { hls: "..." }`
    // or inside a specific script tag.
    const hlsMatch = /'hls':\s*'([^']+)'/.exec(res.body) || /"hls":\s*"([^"]+)"/.exec(res.body);
    const videoUrl = hlsMatch ? hlsMatch[1] : null;

    if (!videoUrl) return [];

    return [{
      name: this.name,
      source: this.name,
      url: videoUrl,
      quality: Qualities.Unknown,
      type: 'm3u8',
      headers: { Referer: this.mainUrl }
    }];
  }
}