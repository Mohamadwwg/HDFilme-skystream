import { Voe, StreamTape, MixDrop } from 'skystream-extractors';

(function () {
    async function getHome(cb) {
        try {
            const url = `${manifest.baseUrl}/`;
            const response = await fetch(url);
            const html = await response.text();

            const items = [];
            const titles = await parse_html(html, ".short-title a", "text");
            const urls = await parse_html(html, ".short-title a", "href");
            const posters = await parse_html(html, ".short-img img", "src");

            for (let i = 0; i < titles.length; i++) {
                items.push(new MultimediaItem({
                    title: titles[i],
                    url: urls[i],
                    posterUrl: posters[i],
                    type: "movie"
                }));
            }

            cb({ success: true, data: { "Trending": items } });
        } catch (e) {
            cb({ success: false, errorCode: "FETCH_ERROR", message: e.toString() });
        }
    }

    async function search(query, cb) {
        try {
            const searchUrl = `${manifest.baseUrl}/index.php?story=${encodeURIComponent(query)}&do=search&subaction=search`;
            const response = await fetch(searchUrl);
            const html = await response.text();

            const items = [];
            const titles = await parse_html(html, ".short-title a", "text");
            const urls = await parse_html(html, ".short-title a", "href");
            const posters = await parse_html(html, ".short-img img", "src");

            for (let i = 0; i < titles.length; i++) {
                items.push(new MultimediaItem({
                    title: titles[i],
                    url: urls[i],
                    posterUrl: posters[i],
                    type: "movie"
                }));
            }

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.toString() });
        }
    }

    async function load(url, cb) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            const title = (await parse_html(html, "h1", "text"))[0] || "Unbekannt";
            const posterUrl = (await parse_html(html, ".full-img img", "src"))[0] || "";
            const description = (await parse_html(html, ".full-text", "text"))[0] || "";

            const item = new MultimediaItem({
                title: title,
                url: url,
                posterUrl: posterUrl,
                type: "movie",
                description: description
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.toString() });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            let streams = [];

            // 1. Suche nach iframes, data-link, data-src oder src-Attributen
            let embedUrls = [];
            const iframes = await parse_html(html, "iframe", "src");
            const dataLinks = await parse_html(html, "[data-link]", "data-link");
            const dataSrcs = await parse_html(html, "[data-src]", "data-src");
            
            embedUrls = [...iframes, ...dataLinks, ...dataSrcs].filter(Boolean);

            // Falls direkt im HTML URLs stehen, Regex-Fallback nutzen
            if (embedUrls.length === 0) {
                const matches = html.match(/https?:\/\/[^\s"'<>]+(?:voe|streamtape|mixdrop)[^\s"'<>]+/gi);
                if (matches) {
                    embedUrls = [...new Set(matches)];
                }
            }

            for (let embedUrl of embedUrls) {
                if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;

                try {
                    if (embedUrl.includes('voe') || embedUrl.includes('v-o-e')) {
                        const extractor = new Voe();
                        const res = await extractor.getUrl(embedUrl);
                        if (res?.length) streams.push(...res);
                    } else if (embedUrl.includes('streamtape')) {
                        const extractor = new StreamTape();
                        const res = await extractor.getUrl(embedUrl);
                        if (res?.length) streams.push(...res);
                    } else if (embedUrl.includes('mixdrop')) {
                        const extractor = new MixDrop();
                        const res = await extractor.getUrl(embedUrl);
                        if (res?.length) streams.push(...res);
                    } else {
                        streams.push(new StreamResult({
                            url: embedUrl,
                            quality: "HD",
                            headers: { "Referer": manifest.baseUrl }
                        }));
                    }
                } catch (err) {
                    console.error("Extractor Fehler:", embedUrl, err);
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