(function() {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    function getHeaders(referer = null) {
        const headers = {
            "User-Agent": userAgent,
            "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
        };
        if (referer) headers["Referer"] = referer;
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

            if (!url || url === "/" || url === base || url === `${base}/` || url.includes("javascript:") || url.includes("#") || url.includes("wp-content")) continue;

            const imgMatch = innerHtml.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
            const titleMatch = innerHtml.match(/alt=["']([^"']+)["']/i) || 
                               innerHtml.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i) || 
                               innerHtml.match(/class=["'][^"']*(?:title|name)[^"']*["'][^>]*>([^<]+)<\//i);

            if (imgMatch && titleMatch) {
                if (url.startsWith("/")) url = `${base}${url}`;
                let poster = imgMatch[1];
                if (poster.startsWith("//")) poster = "https:" + poster;
                if (poster.startsWith("/")) poster = `${base}${poster}`;

                let title = titleMatch[1]
                    .replace(/<[^>]*>/g, "")
                    .replace(/\s*poster$/i, "")
                    .replace(/&#039;/g, "'")
                    .replace(/&amp;/g, "&")
                    .trim();

                if (title && !items.find(i => i.url === url)) {
                    items.push(new MultimediaItem({
                        title: title,
                        url: url,
                        posterUrl: poster,
                        type: url.includes("serie") || url.includes("season") ? "series" : "movie"
                    }));
                }
            }
        }
        return items;
    }

    // 1. Dashboard Categories
    async function getHome(cb) {
        try {
            const res = await http_get(manifest.baseUrl, getHeaders());
            const body = res ? (res.body || "") : "";
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

    // 2. Search Queries
    async function search(query, cb) {
        try {
            const searchUrl = `${manifest.baseUrl}/?s=${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, getHeaders(manifest.baseUrl));
            const items = extractItems(res ? (res.body || "") : "");

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    // 3. Load Details
    async function load(url, cb) {
        try {
            const targetUrl = url.startsWith("/") ? `${manifest.baseUrl}${url}` : url;
            const res = await http_get(targetUrl, getHeaders(manifest.baseUrl));
            const body = res ? (res.body || "") : "";

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
                title: title,
                url: targetUrl,
                posterUrl: posterUrl,
                description: description,
                type: targetUrl.includes("serie") ? "series" : "movie",
                episodes: episodes,
                headers: getHeaders(targetUrl)
            });

            cb({ success: true, data: mediaItem });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    // 4. Streams / Video-Hoster Extraction
    // 4. Streams / Video-Hoster Extraction
    async function loadStreams(url, cb) {
        try {
            const targetUrl = typeof url === "object" && url.url ? url.url : url;
            const streams = [];

            const res = await http_get(targetUrl, getHeaders(targetUrl));
            const html = res ? (res.body || "") : "";

            let embedUrl = null;

            // IMDb-ID suchen & API abfragen
            const imdbMatch = html.match(/var\s+imdb\s*=\s*'([^']+)';/i);
            if (imdbMatch && imdbMatch[1]) {
                try {
                    const apiRes = await http_get(`https://meinecloud.click/serials.php?task=check&id_imdb=${imdbMatch[1]}`, getHeaders());
                    if (apiRes && apiRes.body) {
                        const apiData = JSON.parse(apiRes.body);
                        if (apiData && apiData.exists && apiData.player_url) {
                            embedUrl = apiData.player_url;
                        }
                    }
                } catch (e) {
                    // API Fallback
                }
            }

            // Fallback-Iframe aus JS
            if (!embedUrl) {
                const fallbackMatch = html.match(/iframe\.src\s*=\s*'([^']+)';/i);
                if (fallbackMatch && fallbackMatch[1]) {
                    embedUrl = fallbackMatch[1];
                }
            }

            if (embedUrl) {
                if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;

                if (typeof extractors !== "undefined" && extractors.extract) {
                    const extracted = await extractors.extract(embedUrl);
                    streams.push(...extracted);
                } else {
                    // Sichere Instanziierung ohne "new Stream"
                    const streamObj = typeof ExtractorStream !== "undefined" 
                        ? new ExtractorStream({ name: "HDFilme Player", url: embedUrl, quality: "HD" })
                        : { name: "HDFilme Player", url: embedUrl, quality: "HD" };
                    
                    streams.push(streamObj);
                }
            }

            if (typeof cb === "function") {
                cb({ success: true, data: streams });
            }
            return streams;
        } catch (e) {
            if (typeof cb === "function") {
                cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
            }
        }
    }

    // Exportieren an SkyStream
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();