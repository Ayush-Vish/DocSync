import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

const assetPath = /^\/media\/([a-f0-9-]{36})$/;
export function mediaPath(value: string): string | null {
  try {
    // Strip a pasted origin and all query credentials. Rendering adds a fresh,
    // scoped grant; saved HTML never contains an expiring access token.
    const url = new URL(value, "https://docsync.invalid");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !assetPath.test(url.pathname)) return null;
    return url.pathname;
  } catch { return null; }
}

export function mediaReferences(html: string): { id: string; kind: "image" | "video" }[] {
  const references: { id: string; kind: "image" | "video" }[] = [];
  const visit = (parent: DefaultTreeAdapterMap["parentNode"]) => {
    for (const node of parent.childNodes) if ("tagName" in node) {
      for (const attr of node.attrs) if (attr.name === "src" || attr.name === "poster") {
        const path = mediaPath(attr.value);
        if (path) references.push({ id: path.slice(7), kind: node.tagName === "img" || attr.name === "poster" ? "image" : "video" });
      }
      visit(node);
    }
  };
  visit(parseFragment(html));
  return references;
}

export function embedMedia(html: string, token: string | undefined, origin: string, thumbnail = false): string {
  const fragment = parseFragment(html);
  const visit = (parent: DefaultTreeAdapterMap["parentNode"]) => {
    for (const node of parent.childNodes) if ("tagName" in node) {
      if (node.tagName === "video") {
        // Thumbnail videos do not download or play offscreen.
        node.attrs = node.attrs.filter(attr => !["autoplay", "preload"].includes(attr.name));
        node.attrs.push({ name: "preload", value: thumbnail ? "none" : "metadata" });
      }
      node.attrs = node.attrs.filter(attr => {
        if (attr.name !== "src" && attr.name !== "poster") return true;
        const path = mediaPath(attr.value);
        if (!path || !token) return false;
        attr.value = `${origin}${path}?access=${encodeURIComponent(token)}`;
        return true;
      });
      visit(node);
    }
  };
  visit(fragment);
  return serialize(fragment);
}

export function mediaPolicy(origin?: string): string {
  const source = origin ? `${new URL(origin).origin}/media/` : "'none'";
  return `img-src ${source}; media-src ${source}`;
}
