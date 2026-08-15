(() => {
  // node_modules/skystream-extractors/dist/core/extractor_api.js
  var ExtractorApi = class {
    fixUrl(url) {
      if (url.startsWith("http"))
        return url;
      if (url.startsWith("//"))
        return `https:${url}`;
      if (url.startsWith("/"))
        return `${this.mainUrl}${url}`;
      return `${this.mainUrl}/${url}`;
    }
  };

  // node_modules/skystream-extractors/dist/core/qualities.js
  var Qualities = {
    Unknown: 400,
    P144: 144,
    P240: 240,
    P360: 360,
    P480: 480,
    P720: 720,
    P1080: 1080,
    P2160: 2160
  };

  // node_modules/skystream-extractors/dist/utils/js_unpacker.js
  var JsUnpacker = {
    unpack: (js) => {
      return getAndUnpack(js);
    }
  };

  // node_modules/skystream-extractors/dist/extractors/mix_drop.js
  var MixDrop = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "MixDrop";
      this.mainUrl = "https://mixdrop.co";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url, referer ? { Referer: referer } : {});
      if (res.status !== 200)
        return [];
      const unpacked = JsUnpacker.unpack(res.body);
      const match = /wurl="(https?:[^"]+)"/.exec(unpacked);
      if (!match)
        return [];
      let finalUrl = match[1];
      if (finalUrl.startsWith("//")) {
        finalUrl = "https:" + finalUrl;
      }
      return [{
        name: "MixDrop",
        source: "MixDrop",
        url: finalUrl,
        quality: Qualities.Unknown,
        type: "video",
        headers: { Referer: this.mainUrl }
      }];
    }
  };

  // node_modules/skystream-extractors/dist/extractors/voe.js
  var Voe = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "Voe";
      this.mainUrl = "https://voe.sx";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url);
      if (res.status !== 200)
        return [];
      const hlsMatch = /'hls':\s*'([^']+)'/.exec(res.body) || /"hls":\s*"([^"]+)"/.exec(res.body);
      const videoUrl = hlsMatch ? hlsMatch[1] : null;
      if (!videoUrl)
        return [];
      return [{
        name: this.name,
        source: this.name,
        url: videoUrl,
        quality: Qualities.Unknown,
        type: "m3u8",
        headers: { Referer: this.mainUrl }
      }];
    }
  };

  // node_modules/skystream-extractors/dist/extractors/stream_tape.js
  var StreamTape = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "StreamTape";
      this.mainUrl = "https://streamtape.com";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url);
      if (res.status !== 200)
        return [];
      const robotLinkElements = await parse_html(res.body, "#norobotlink", "innerHTML");
      if (!robotLinkElements || robotLinkElements.length === 0)
        return [];
      const innerHtml = robotLinkElements[0].html;
      const part1Match = /'([^']+)'/.exec(innerHtml) || /"([^"]+)"/.exec(innerHtml);
      const part2Match = /innerHTML\s*=\s*['"](.*?)['"]\s*\+\s*\(['"](.*?)['"]/.exec(res.body);
      let videoUrl = "";
      if (part2Match) {
        videoUrl = `https:${part2Match[1]}${part2Match[2]}`;
      } else if (part1Match) {
        videoUrl = `https:${part1Match[1]}`;
      }
      if (!videoUrl || videoUrl === "https:")
        return [];
      const finalUrl = videoUrl.replace(/&amp;/g, "&");
      return [{
        name: this.name,
        source: this.name,
        url: finalUrl,
        quality: Qualities.Unknown,
        type: "video",
        headers: { Referer: this.mainUrl }
      }];
    }
  };

  // plugin.js
  (function() {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    function getHeaders(referer = null) {
      const headers = {
        "User-Agent": userAgent,
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
      };
      if (referer)
        headers["Referer"] = referer;
      return headers;
    }
    function extractItems(html) {
      const items = [];
      const base = manifest.baseUrl;
      const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        let url = match[1];
        const innerHtml = match[2];
        if (!url || url === "/" || url === base || url === `${base}/` || url.includes("javascript:") || url.includes("#") || url.includes("wp-content"))
          continue;
        const imgMatch = innerHtml.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
        const titleMatch = innerHtml.match(/alt=["']([^"']+)["']/i) || innerHtml.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i) || innerHtml.match(/class=["'][^"']*(?:title|name)[^"']*["'][^>]*>([^<]+)<\//i);
        if (imgMatch && titleMatch) {
          if (url.startsWith("/"))
            url = `${base}${url}`;
          let poster = imgMatch[1];
          if (poster.startsWith("//"))
            poster = "https:" + poster;
          if (poster.startsWith("/"))
            poster = `${base}${poster}`;
          let title = titleMatch[1].replace(/<[^>]*>/g, "").replace(/\s*poster$/i, "").replace(/&#039;/g, "'").replace(/&amp;/g, "&").trim();
          if (title && !items.find((i) => i.url === url)) {
            items.push(new MultimediaItem({
              title,
              url,
              posterUrl: poster,
              type: url.includes("serie") || url.includes("season") ? "series" : "movie"
            }));
          }
        }
      }
      return items;
    }
    async function getHome(cb) {
      try {
        const res = await http_get(manifest.baseUrl, getHeaders());
        const body = res ? res.body || "" : "";
        const items = extractItems(body);
        if (items.length === 0) {
          return cb({ success: false, errorCode: "HOME_ERROR", message: "Keine Inhalte auf der Startseite gefunden." });
        }
        cb({
          success: true,
          data: {
            "Trending": items.slice(0, 5),
            "Aktuelle Filme & Serien": items
          }
        });
      } catch (e) {
        cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
      }
    }
    async function search(query, cb) {
      try {
        const searchUrl = `${manifest.baseUrl}/?s=${encodeURIComponent(query)}`;
        const res = await http_get(searchUrl, getHeaders(manifest.baseUrl));
        const items = extractItems(res ? res.body || "" : "");
        cb({ success: true, data: items });
      } catch (e) {
        cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
      }
    }
    async function load(url, cb) {
      try {
        const targetUrl = url.startsWith("/") ? `${manifest.baseUrl}${url}` : url;
        const res = await http_get(targetUrl, getHeaders(manifest.baseUrl));
        const body = res ? res.body || "" : "";
        const titleMatch = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || body.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(/\s*hdfilme.*$/i, "").trim() : "Unbekannt";
        const descMatch = body.match(/<div class=["'](?:description|summary|entry-content)["'][^>]*>([\s\S]*?)<\/div>/i) || body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";
        const posterMatch = body.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
        const posterUrl = posterMatch ? posterMatch[1] : null;
        const episodes = [
          new Episode({
            name: "Film / Stream abspielen",
            url: targetUrl,
            season: 1,
            episode: 1,
            headers: getHeaders(targetUrl)
          })
        ];
        const mediaItem = new MultimediaItem({
          title,
          url: targetUrl,
          posterUrl,
          description,
          type: targetUrl.includes("serie") ? "series" : "movie",
          episodes,
          headers: getHeaders(targetUrl)
        });
        cb({ success: true, data: mediaItem });
      } catch (e) {
        cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
      }
    }
    function tryDecodeBase64(str) {
      try {
        if (/^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0) {
          const decoded = atob(str);
          if (decoded.startsWith("http://") || decoded.startsWith("https://") || decoded.startsWith("//")) {
            return decoded;
          }
        }
      } catch (e) {
      }
      return str;
    }
    async function loadStreams(url, cb) {
      try {
        const res = await http_get(url, getHeaders(url));
        const html = res ? res.body || "" : "";
        const streams = [];
        const embedUrls = /* @__PURE__ */ new Set();
        const urlRegex = /(?:src|data-src|data-link|data-url|data-file|href)=["']([^"']+)["']/gi;
        let match;
        while ((match = urlRegex.exec(html)) !== null) {
          let rawLink = match[1];
          if (!rawLink)
            continue;
          let link = tryDecodeBase64(rawLink);
          if (link.startsWith("//")) {
            link = "https:" + link;
          }
          if (/voe|v-o-e|streamtape|mixdrop|dood|filemoon/i.test(link)) {
            embedUrls.add(link);
          }
        }
        const extractors = [
          { name: "voe", instance: new Voe() },
          { name: "streamtape", instance: new StreamTape() },
          { name: "mixdrop", instance: new MixDrop() }
        ];
        for (const embedUrl of embedUrls) {
          for (const ext of extractors) {
            const isVoe = ext.name === "voe" && /voe|v-o-e|fittingly|reputation/i.test(embedUrl);
            const isOther = embedUrl.toLowerCase().includes(ext.name);
            if (isVoe || isOther) {
              try {
                const result = await ext.instance.getUrl(embedUrl);
                if (result) {
                  const list = Array.isArray(result) ? result : [result];
                  for (const item of list) {
                    if (item && item.url) {
                      if (!item.headers || Object.keys(item.headers).length === 0) {
                        item.headers = getHeaders(embedUrl);
                      }
                      streams.push(item);
                    }
                  }
                }
              } catch (err) {
                console.error(`Fehler bei Extractor ${ext.name}:`, err);
              }
            }
          }
        }
        cb({ success: true, data: streams });
      } catch (e) {
        cb({ success: false, errorCode: "STREAM_ERROR", message: e.toString() });
      }
    }
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
  })();
})();
