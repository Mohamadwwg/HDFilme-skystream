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
  var manifest = {
    baseUrl: "https://moflix-stream.xyz"
  };
  var userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  function getHeaders(referer = null) {
    const headers = {
      "User-Agent": userAgent,
      "Accept": "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (referer)
      headers["Referer"] = referer;
    return headers;
  }
  async function fetchJson(url, referer = manifest.baseUrl) {
    try {
      const res = await http_get(url, getHeaders(referer));
      const body = res ? res.body || "" : "";
      if (!body || body.trim().startsWith("<"))
        return null;
      return JSON.parse(body);
    } catch (e) {
      console.error(`[moflix] Fehler beim API-Abruf (${url}):`, e.message);
      return null;
    }
  }
  function parseMediaItem(item) {
    if (!item || item.model_type !== "title")
      return null;
    let poster = item.poster || item.backdrop;
    if (poster && !poster.startsWith("http")) {
      poster = `${manifest.baseUrl}/${poster.replace(/^\//, "")}`;
    }
    const type = item.type === "series" || item.is_series ? "series" : "movie";
    const detailUrl = `${manifest.baseUrl}/api/v1/titles/${item.id}?loader=titlePage`;
    return new MultimediaItem({
      title: item.name || item.title || "Unbekannt",
      url: detailUrl,
      posterUrl: poster,
      type,
      headers: getHeaders(manifest.baseUrl)
    });
  }
  async function getHome(cb) {
    try {
      const data = await fetchJson(`${manifest.baseUrl}/api/v1/search/a?loader=searchPage`);
      if (!data || !data.results) {
        return cb({ success: false, errorCode: "HOME_ERROR", message: "Keine Inhalte empfangen." });
      }
      const items = data.results.map(parseMediaItem).filter(Boolean);
      cb({
        success: true,
        data: {
          "Trending": items.slice(0, 10),
          "Neueste Ver\xF6ffentlichungen": items
        }
      });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }
  async function search(query, cb) {
    try {
      const searchUrl = `${manifest.baseUrl}/api/v1/search/${encodeURIComponent(query)}?loader=searchPage`;
      const data = await fetchJson(searchUrl);
      if (!data || !data.results) {
        return cb({ success: true, data: [] });
      }
      const items = data.results.map(parseMediaItem).filter(Boolean);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
    }
  }
  async function load(url, cb) {
    try {
      let apiUrl = url;
      if (!apiUrl.includes("/api/v1/titles/")) {
        const idMatch = url.match(/(\d+)/);
        if (!idMatch)
          throw new Error("Ung\xFCltige Title-ID.");
        apiUrl = `${manifest.baseUrl}/api/v1/titles/${idMatch[1]}?loader=titlePage`;
      }
      const data = await fetchJson(apiUrl);
      const titleData = data?.title;
      if (!titleData) {
        return cb({ success: false, errorCode: "LOAD_ERROR", message: "Titel-Daten konnten nicht geladen werden." });
      }
      const title = titleData.name || titleData.title || "Unbekannt";
      const description = titleData.description || "";
      let poster = titleData.poster || titleData.backdrop;
      if (poster && !poster.startsWith("http"))
        poster = `${manifest.baseUrl}/${poster.replace(/^\//, "")}`;
      const isSeries = titleData.type === "series" || titleData.is_series;
      const episodes = [];
      if (isSeries && Array.isArray(titleData.seasons)) {
        for (const season of titleData.seasons) {
          const seasonNum = season.number || season.season_number || 1;
          const eps = season.episodes || [];
          for (const ep of eps) {
            const epNum = ep.number || ep.episode_number || 1;
            const epName = ep.name ? `S${seasonNum}E${epNum} - ${ep.name}` : `Staffel ${seasonNum} Folge ${epNum}`;
            const epUrl = `${manifest.baseUrl}/api/v1/titles/${titleData.id}/seasons/${seasonNum}/episodes/${epNum}?loader=episodePage`;
            episodes.push(new Episode({
              name: epName,
              url: epUrl,
              season: seasonNum,
              episode: epNum,
              posterUrl: poster,
              headers: getHeaders(apiUrl)
            }));
          }
        }
      } else {
        episodes.push(new Episode({
          name: title,
          url: apiUrl,
          season: 1,
          episode: 1,
          posterUrl: poster,
          headers: getHeaders(apiUrl)
        }));
      }
      const mediaItem = new MultimediaItem({
        title,
        url: apiUrl,
        posterUrl: poster,
        bannerUrl: poster,
        backgroundPosterUrl: poster,
        description,
        type: isSeries ? "series" : "movie",
        episodes,
        headers: getHeaders(apiUrl)
      });
      cb({ success: true, data: mediaItem });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
    }
  }
  async function loadStreams(url, cb) {
    try {
      console.log("[moflix] Lade Video-Links von API:", url);
      const data = await fetchJson(url);
      const itemObj = data?.title || data?.episode;
      const videos = itemObj?.videos || [];
      if (!videos || videos.length === 0) {
        return cb({ success: false, errorCode: "NO_STREAMS", message: "Keine Video-Links gefunden." });
      }
      const streams = [];
      const extractors = [
        { name: "VOE", instance: new Voe(), matcher: /voe|v-o-e|fittingly|reputation|jumper|yugen/i },
        { name: "StreamTape", instance: new StreamTape(), matcher: /streamtape/i },
        { name: "MixDrop", instance: new MixDrop(), matcher: /mixdrop/i }
      ];
      for (const video of videos) {
        const rawUrl = video.src;
        if (!rawUrl)
          continue;
        const quality = parseInt(video.quality) || 1080;
        if (rawUrl.includes(".m3u8") || rawUrl.includes("voldemort")) {
          streams.push(new StreamResult({
            url: rawUrl,
            source: `Moflix Direct (${video.name || "Premium"})`,
            quality,
            headers: getHeaders(url)
          }));
          continue;
        }
        let extracted = false;
        for (const ext of extractors) {
          if (ext.matcher.test(rawUrl)) {
            try {
              const result = await ext.instance.getUrl(rawUrl);
              if (result) {
                const list = Array.isArray(result) ? result : [result];
                for (const resItem of list) {
                  const streamUrl = typeof resItem === "string" ? resItem : resItem.url;
                  if (streamUrl) {
                    streams.push(new StreamResult({
                      url: streamUrl,
                      source: `Moflix - ${ext.name}`,
                      quality: resItem.quality || quality,
                      headers: getHeaders(rawUrl)
                    }));
                    extracted = true;
                  }
                }
              }
            } catch (extErr) {
              console.error(`[moflix] Extractor Fehler (${ext.name}):`, extErr.message);
            }
          }
        }
        if (!extracted) {
          streams.push(new StreamResult({
            url: rawUrl,
            source: `Moflix Mirror (${video.name || "Embed"})`,
            quality,
            headers: getHeaders(rawUrl)
          }));
        }
      }
      if (streams.length === 0) {
        return cb({ success: false, errorCode: "NO_STREAMS", message: "Keine abspielbaren Streams." });
      }
      return cb({ success: true, data: streams });
    } catch (e) {
      return cb({ success: false, errorCode: "STREAM_ERROR", message: e.toString() });
    }
  }
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
