# Contributing to SkyStream Extractors

Welcome to the `skystream-extractors` workspace! This package hosts the unified video host resolution engine for SkyStream. It is designed to be highly compatible with CloudStream extractors, meaning most existing CloudStream extractors can be ported directly over with minimal changes.

## 1. Environment Setup

To begin developing or porting an extractor, install the workspace dependencies:

```bash
cd skystream-tools/extractors
npm install
```

## 2. Creating a New Extractor

All extractors live in `src/extractors/`. To create a new one, add a new `.ts` file named after the host (e.g. `stream_tape.ts`).

### Basic Extractor Template

```typescript
import { ExtractorApi, IExtractorLink } from '../core/extractor_api';
import { Qualities } from '../core/qualities';
// Import any utils you need: JsUnpacker, M3u8Helper, etc.

export class MyExtractor extends ExtractorApi {
  name = 'MyExtractor';
  mainUrl = 'https://myextractor.com';
  requiresReferer = false;

  async getUrl(url: string, referer?: string): Promise<IExtractorLink[]> {
    // 1. Fetch the host URL
    const res = await http_get(url, referer ? { Referer: referer } : {});
    if (res.status !== 200) return [];

    // 2. Perform Extraction
    // Example: Find the .m3u8 link in the HTML
    const match = /source:\s*"(https?:\/\/[^"]+\.m3u8)"/.exec(res.body);
    if (!match) return [];

    // 3. Return the Stream Result
    return [{
      name: this.name,
      source: this.name,
      url: match[1],
      quality: Qualities.Unknown,
      type: 'm3u8',
      headers: { Referer: this.mainUrl }
    }];
  }
}

// 4. Export the extractor (no registration required)
// The class is automatically exported at the bottom of the file if needed, but the class is already exported above.

## 3. Exporting Your Extractor

Once you have created your extractor, you must export it in the main entrypoint so plugins can import it. Open `src/index.ts` and add your explicit export at the bottom:

```typescript
export { HubCloud } from './extractors/hub_cloud';
export { MixDrop } from './extractors/mix_drop';
export { MyExtractor } from './extractors/my_extractor'; // <-- Add this
```

## 4. The Extractor Toolbelt

SkyStream provides high-performance native bridges to replace the heavy JavaScript operations that usually slow down web scrapers on mobile devices.

### Native DOM Parser
Avoid using heavy regex to parse HTML! Use the native `parse_html` bridge instead. It runs directly in the Dart isolate and returns clean JSON.

```typescript
// Get all links inside the 'download' div
const elements = await parse_html(res.body, 'div.download a', 'href');

// Returns: [{ text: "Click Here", html: "...", attr: "https://link.com" }]
const urls = elements.map(e => e.attr);
```

### Native JS Unpacker (P.A.C.K.E.R)
If a site obfuscates its player code using Dean Edwards' P.A.C.K.E.R, you can unpack it natively in milliseconds.

```typescript
import { JsUnpacker } from '../utils/js_unpacker';

const unpacked = JsUnpacker.unpack(res.body);
```

### Parallel HTTP Requests
If you need to fetch 5 different mirror links at the same time, don't await them one-by-one. Use `http_parallel` to fire them concurrently in the native engine.

```typescript
const requests = mirrorUrls.map(url => ({ method: 'GET', url }));
const responses = await http_parallel(requests);

for (const res of responses) {
    if (res.status === 200) { /* Process */ }
}
```

### M3U8 Helper
Quickly resolve a master `.m3u8` playlist into a list of stream qualities.

```typescript
import { M3u8Helper } from '../utils/m3u8_helper';

const streams = await M3u8Helper.getM3U8Qualities(masterUrl, { Referer: this.mainUrl });
return streams;
```

## 5. Porting from CloudStream

The `skystream-extractors` package uses the exact same interface names (`ExtractorApi`, `getUrl`) as CloudStream's Kotlin base classes. 

**Key Translation Rules:**
- Replace Kotlin `app.get(url).text` with `await http_get(url).then(r => r.body)`.
- Replace Kotlin `JsUnpacker(text).unpack()` with `JsUnpacker.unpack(text)`.
- Replace Kotlin `M3u8Helper.generateM3u8(...)` with `await M3u8Helper.getM3U8Qualities(...)`.
- The method signature is `async getUrl(url: string, referer?: string): Promise<IExtractorLink[]>`.

## 6. Testing Extractors

You can test any extractor locally against a live URL without needing the Android app. We provide a built-in `test-extractor.js` script that mocks the native `http_get` and `parse_html` bridges and queries the extractor registry just like the real engine would.

To test an extractor, run the following from the `extractors/` folder:

```bash
# Rebuild the workspace to include your changes
npm run build

# Run the test script with the target URL
npm run test -- "https://hubcloud.club/drive/abcd"
```

This will print out the beautifully formatted JSON array of `IExtractorLink` objects exactly as they will be sent back to the SkyStream video player.

> [!IMPORTANT]
> Always ensure there is a **space** after the `--` separator (e.g., `npm run test -- "URL"`). If you omit the space, npm will attempt to parse the URL as an internal configuration flag and the test will fail.

## 7. Build & Deploy

Once your extractor works perfectly, build the workspace to generate the final `dist/index.js` file:
```bash
npm run build
```
This final bundle will be automatically used by the `skystream deploy` CLI when bundling user plugins.
