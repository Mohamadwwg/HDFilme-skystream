import { Voe, StreamTape, MixDrop } from 'skystream-extractors/dist/index.js';

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

    function fixUrl(url) {
        if (!url) return null;
        let cleaned = url.trim();
        if (cleaned.startsWith("//")) return "https:" + cleaned;
        if (cleaned.startsWith("/")) return `${manifest.baseUrl}${cleaned}`;
        return cleaned;
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

            const imgMatch = innerHtml.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i);
            const titleMatch = innerHtml.match(/alt=["']([^"']+)["']/i) || 
                               innerHtml.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i) || 
                               innerHtml.match(/class=["'][^"']*(?:title|name)[^"']*["'][^>]*>([^<]+)<\//i);

            if (imgMatch && titleMatch) {
                const fullUrl = fixUrl(url);
                const poster = fixUrl(imgMatch[1]);
                let title = titleMatch[1]
                    .replace(/<[^>]*>/g, "")
                    .replace(/\s*poster$/i, "")
                    .replace(/&#039;/g, "'")
                    .replace(/&amp;/g, "&")
                    .trim();

                if (title && !items.find(i => i.url === fullUrl)) {
                    items.push(new MultimediaItem({
                        title: title,
                        url: fullUrl,
                        posterUrl: poster,
                        type: fullUrl.includes("serie") || fullUrl.includes("season") ? "series" : "movie",
                        headers: getHeaders(fullUrl)
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
                    "Trending": items.slice(0, 6),
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
            const targetUrl = fixUrl(url);
            const res = await http_get(targetUrl, getHeaders(targetUrl));
            const body = res ? (res.body || "") : "";

            const titleMatch = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || body.match(/<title>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(/\s*hdfilme.*$/i, "").trim() : "Unbekannt";

            const descMatch = body.match(/<div class=["'](?:description|summary|entry-content|f-desc)["'][^>]*>([\s\S]*?)<\/div>/i) || body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

            const posterMatch = body.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i) || 
                                body.match(/<div class=["'][^"']*poster[^"']*["'][^>]*>\s*<img[^>]+(?:src|data-src)=["']([^"']+)["']/i) ||
                                body.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*class=["'][^"']*poster[^"']*["']/i);
            
            const posterUrl = posterMatch ? fixUrl(posterMatch[1]) : null;

            const episodes = [
                new Episode({
                    name: title,
                    url: targetUrl,
                    season: 1,
                    episode: 1,
                    posterUrl: posterUrl,
                    headers: getHeaders(targetUrl)
                })
            ];

            const mediaItem = new MultimediaItem({
                title: title,
                url: targetUrl,
                posterUrl: posterUrl,
                bannerUrl: posterUrl,
                backgroundPosterUrl: posterUrl,
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

    function tryDecodeBase64(str) {
        try {
            if (/^[A-Za-z0-9+/=]+$/.test(str) && str.length > 10 && str.length % 4 === 0) {
                const decoded = atob(str);
                if (decoded.startsWith("http://") || decoded.startsWith("https://") || decoded.startsWith("//")) {
                    return decoded;
                }
            }
        } catch (e) {}
        return str;
    }

    // 4. Load Streams
    async function loadStreams(url, cb) {
        try {
            const targetUrl = fixUrl(url);
            const res = await http_get(targetUrl, getHeaders(targetUrl));
            const html = res ? (res.body || "") : "";

            const streams = [];
            const embedUrls = new Set();

            // Suchen nach Links & iframe SRCs
            const regexes = [
                /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi,
                /(?:src|data-src|data-link|data-url|href)=["']([^"']+)["']/gi
            ];

            for (const reg of regexes) {
                let match;
                while ((match = reg.exec(html)) !== null) {
                    let link = tryDecodeBase64(match[1]);
                    link = fixUrl(link);

                    if (link && /voe|v-o-e|fittingly|reputation|jumper|yugen|streamtape|mixdrop/i.test(link)) {
                        embedUrls.add(link);
                    }
                }
            }

            const extractors = [
                { name: "VOE", instance: new Voe(), matcher: /voe|v-o-e|fittingly|reputation|jumper|yugen/i },
                { name: "StreamTape", instance: new StreamTape(), matcher: /streamtape/i },
                { name: "MixDrop", instance: new MixDrop(), matcher: /mixdrop/i }
            ];

            for (const embedUrl of embedUrls) {
                for (const ext of extractors) {
                    if (ext.matcher.test(embedUrl)) {
                        try {
                            const result = await ext.instance.getUrl(embedUrl);
                            if (result) {
                                const list = Array.isArray(result) ? result : [result];
                                for (const item of list) {
                                    let videoUrl = typeof item === 'string' ? item : item.url;
                                    let quality = (typeof item === 'object' && item.quality) ? item.quality : 1080;
                                    
                                    if (videoUrl) {
                                        streams.push(new StreamResult({
                                            url: videoUrl,
                                            source: `HDFilme - ${ext.name}`,
                                            quality: quality,
                                            headers: getHeaders(embedUrl)
                                        }));
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Extractor error (${ext.name}):`, err);
                        }
                    }
                }
            }

            if (streams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "Keine abspielbaren Streams gefunden." });
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