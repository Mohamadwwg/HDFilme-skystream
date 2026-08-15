import { IExtractorLink } from '../core/extractor_api';
import { qualityFromString } from '../core/qualities';

// Assume global http_get is available via engine
declare global {
  function http_get(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string; headers: Record<string, string> }>;
}

export class M3u8Helper {
  static async getM3U8Qualities(
    masterUrl: string,
    headers?: Record<string, string>
  ): Promise<IExtractorLink[]> {
    try {
      const resp = await http_get(masterUrl, headers);
      if (resp.status !== 200 || !resp.body) return [];
      
      const lines = resp.body.split('\n');
      const results: IExtractorLink[] = [];
      
      let currentQuality = 400;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          const resMatch = /RESOLUTION=\d+x(\d+)/.exec(line);
          if (resMatch) {
            currentQuality = qualityFromString(`${resMatch[1]}p`);
          } else {
            const nameMatch = /NAME="([^"]+)"/.exec(line);
            if (nameMatch) currentQuality = qualityFromString(nameMatch[1]);
          }
        } else if (line && !line.startsWith('#')) {
          results.push({
            name: 'M3U8',
            source: 'M3u8Helper',
            url: line.startsWith('http') ? line : new URL(line, masterUrl).toString(),
            quality: currentQuality,
            type: 'm3u8',
            headers
          });
        }
      }
      return results;
    } catch (e) {
      console.error('[M3u8Helper] getM3U8Qualities error:', e);
      return [];
    }
  }
}
