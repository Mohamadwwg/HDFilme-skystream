import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { Qualities } from '../core/qualities';

export class DoodExtractor extends ExtractorApi {
  name = 'DoodStream';
  mainUrl = 'https://dood.watch';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    // Note: Dood uses a custom MD5 mechanism to generate tokens
    // We would fetch the page, find the /pass_md5/ URL, fetch it, and append a random token + timestamp.
    const res = await http_get(url);
    if (res.status !== 200) return [];

    const md5Match = /\/pass_md5\/[^']*/.exec(res.body);
    if (!md5Match) return [];

    const md5Url = `https://${new URL(url).hostname}${md5Match[0]}`;
    const md5Res = await http_get(md5Url, { Referer: url });
    
    // Append random string to the md5 response text
    const tokenMatch = /token=([^&]+)/.exec(md5Url);
    const token = tokenMatch ? tokenMatch[1] : '';
    
    function makeid(length: number) {
      let result = '';
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    }

    const videoUrl = md5Res.body + makeid(10) + '?token=' + token + '&expiry=' + Date.now();

    return [{
      name: this.name,
      source: this.name,
      url: videoUrl,
      quality: Qualities.Unknown,
      type: 'video',
      headers: { Referer: url }
    }];
  }
}