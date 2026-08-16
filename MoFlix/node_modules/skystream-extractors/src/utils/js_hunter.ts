export class JsHunter {
  static findFromJs(js: string, variableName: string): any {
    try {
      const regex = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\]|{[\\s\\S]*?});?`);
      const match = regex.exec(js);
      if (match) {
        let jsonStr = match[1].replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        jsonStr = jsonStr.replace(/'/g, '"');
        return JSON.parse(jsonStr);
      }
    } catch (e) {
      console.error('[JsHunter] findFromJs error:', e);
    }
    return null;
  }
}
