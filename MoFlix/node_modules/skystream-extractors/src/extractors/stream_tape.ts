import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { Qualities } from '../core/qualities';

export class StreamTape extends ExtractorApi {
  name = 'StreamTape';
  mainUrl = 'https://streamtape.com';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    const res = await http_get(url);
    if (res.status !== 200) return [];

    // Use our native parse_html bridge to find the element
    const robotLinkElements = await parse_html(res.body, '#norobotlink', 'innerHTML');
    if (!robotLinkElements || robotLinkElements.length === 0) return [];

    const innerHtml = robotLinkElements[0].html;
    
    // Usually it looks like: document.getElementById('norobotlink').innerHTML = 'some_url_part' + 'some_other_part';
    // StreamTape does string concatenation in the JS. Let's do a basic regex to extract the parts.
    const part1Match = /'([^']+)'/.exec(innerHtml) || /"([^"]+)"/.exec(innerHtml);
    const part2Match = /innerHTML\s*=\s*['"](.*?)['"]\s*\+\s*\(['"](.*?)['"]/.exec(res.body);

    let videoUrl = '';
    if (part2Match) {
        videoUrl = `https:${part2Match[1]}${part2Match[2]}`;
    } else if (part1Match) {
        // Fallback
        videoUrl = `https:${part1Match[1]}`;
    }

    if (!videoUrl || videoUrl === 'https:') return [];

    // The streamtape URL often contains a token that needs to be appended
    const finalUrl = videoUrl.replace(/&amp;/g, '&');

    return [{
      name: this.name,
      source: this.name,
      url: finalUrl,
      quality: Qualities.Unknown,
      type: 'video',
      headers: { Referer: this.mainUrl }
    }];
  }
}