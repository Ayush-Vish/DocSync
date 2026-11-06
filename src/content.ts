import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import * as cssTree from 'css-tree';
import { contentSchema, type Content } from './document.ts';
import { embedMedia, mediaPath, mediaPolicy } from './media-url.ts';
export type { Content, Document } from './document.ts';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message); this.status = status; this.details = details;
  }
}

const tags = new Set('article section div span p h1 h2 h3 h4 h5 h6 header footer main aside nav strong em b i u s small mark sub sup blockquote pre code ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col hr br details summary figure figcaption button input label select option output progress meter canvas img video source'.split(' '));
const attrs = new Set('id class title role aria-label aria-hidden aria-describedby aria-live aria-pressed colspan rowspan scope start reversed open type value min max step checked disabled selected for width height'.split(' '));
const cssAtRules = new Set(['media', 'supports', 'container', 'layer', 'page', 'keyframes', '-webkit-keyframes']);

export function cleanCss(source: string, inline = false): string {
  try {
    const ast = cssTree.parse(source, { context: inline ? 'declarationList' : 'stylesheet', parseCustomProperty: true, onParseError: () => { throw Error('Invalid CSS'); } });
    cssTree.walk(ast, (node: any) => {
      if (node.type === 'Raw' || node.type === 'Url' || (node.type === 'Atrule' && !cssAtRules.has(node.name.toLowerCase()))) throw Error('External resources and unsupported CSS rules are disabled');
      if (node.type === 'Function' && ['url', 'expression', 'image-set', '-webkit-image-set'].includes(node.name.toLowerCase())) throw Error('External CSS resources are disabled');
      if (node.type === 'Declaration' && ['behavior', '-moz-binding'].includes(node.property.toLowerCase())) throw Error('Unsafe CSS property');
    });
    // CSS is inserted into a style element. Never allow an HTML closing tag to escape it.
    return cssTree.generate(ast).replaceAll('<', '\\3c ');
  } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid CSS'); }
}

export function cleanHtml(source: string): string {
  const fragment = parseFragment(source);
  const visit = (parent: DefaultTreeAdapterMap['parentNode'], depth = 0) => {
    if (depth > 80) throw new HttpError(400, 'HTML nesting exceeds 80 levels');
    parent.childNodes = parent.childNodes.filter(node => {
      if (node.nodeName === '#text') return true;
      if (!('tagName' in node) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !tags.has(node.tagName)) return false;
      node.attrs = node.attrs.filter(attr => {
        if (attr.namespace) return false;
        if (attr.name === 'src' || attr.name === 'poster') {
          if (attr.name === 'poster' ? node.tagName !== 'video' : !['img','video','source'].includes(node.tagName)) return false;
          const path = mediaPath(attr.value);
          if (!path) return false;
          attr.value = path;
          return true;
        }
        return attrs.has(attr.name) || attr.name === 'style' || (node.tagName === 'img' && ['alt','loading','decoding'].includes(attr.name)) || (node.tagName === 'video' && ['controls','playsinline','muted','loop','preload'].includes(attr.name));
      }).map(attr => attr.name === 'style' ? { ...attr, value: cleanCss(attr.value, true) } : attr);
      if (node.tagName === 'img' && !node.attrs.some(attr => attr.name === 'src')) return false;
      if (node.tagName === 'video' && !node.attrs.some(attr => attr.name === 'controls')) node.attrs.push({ name: 'controls', value: '' });
      if (node.tagName === 'input') {
        const type = node.attrs.find(attr => attr.name === 'type');
        if (type && !['text', 'number', 'range', 'checkbox', 'radio', 'color', 'date'].includes(type.value.toLowerCase())) type.value = 'text';
      }
      visit(node, depth + 1);
      return true;
    });
  };
  visit(fragment);
  return serialize(fragment);
}

export function validateContent(input: unknown): Content {
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, 'Invalid document', parsed.error.flatten());
  const value = parsed.data;
  if (value.pages && value.sections.length) throw new HttpError(400, 'Provide pages or sections, not both. Pages and sections are interchangeable; use one field per request.');
  const sections = value.pages ?? value.sections;
  if (!sections.length) throw new HttpError(400, 'Document must contain at least one page or section');
  value.sections = sections;
  if (new Set(value.sections.map(s => s.id)).size !== value.sections.length) throw new HttpError(400, 'Section IDs must be unique');
  if (new TextEncoder().encode(JSON.stringify(value)).length > 500_000) throw new HttpError(413, 'Document exceeds 500 KB');
  return { title: value.title, ...(value.format || value.pages ? { format: value.format ?? 'document' } : {}), sections: sections.map(s => ({ ...s, html: cleanHtml(s.html), css: cleanCss(s.css) })) };
}

/** Return non-blocking design quality warnings for the given content. */
export function lintContent(content: Content): string[] {
  const warnings: string[] = [];
  for (const section of content.sections) {
    // 1. Slide word count
    const textContent = section.html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textContent ? textContent.split(/\s+/).length : 0;
    if (wordCount > 120) {
      warnings.push(`Section '${section.id}' has ${wordCount} words. Aim for under 60 words per slide for readability.`);
    }

    // 2. CSS size
    const cssBytes = new TextEncoder().encode(section.css).length;
    if (cssBytes > 20_000) {
      warnings.push(`Section '${section.id}' CSS is ${Math.round(cssBytes / 1024)}KB. Consider using theme-base.css utility classes to reduce custom CSS.`);
    }

    // 3. Missing semantic headings
    if (!/< *h[123][\s>]/i.test(section.html)) {
      warnings.push(`Section '${section.id}' has no heading. Use semantic headings for accessibility.`);
    }

    // 4. Excessive color usage
    const hexColors = section.css.match(/#(?:[0-9a-fA-F]{3,8})\b/g) ?? [];
    const rgbColors = section.css.match(/rgba?\s*\([^)]+\)/gi) ?? [];
    const uniqueColors = new Set([...hexColors.map(c => c.toLowerCase()), ...rgbColors.map(c => c.toLowerCase().replace(/\s/g, ''))]);
    if (uniqueColors.size > 8) {
      warnings.push(`Section '${section.id}' uses ${uniqueColors.size} colors. Stick to 3-4 primary colors plus accents for visual consistency.`);
    }

    // 5. Small font detection (exclude media queries and chart labels)
    const cssWithoutMedia = section.css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
    const fontSizes = cssWithoutMedia.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi) ?? [];
    for (const match of fontSizes) {
      const px = parseFloat(match.replace(/font-size\s*:\s*/i, ''));
      if (px < 14) {
        warnings.push(`Section '${section.id}' uses small fonts (below 14px). Ensure minimum 16px for body text.`);
        break;
      }
    }
  }
  return warnings;
}

export const framePolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'";
export function frameSource(section: Content['sections'][number], media?: { token: string; origin: string; thumbnail?: boolean }): string {
  const policy = media ? framePolicy.replace("img-src 'none'", mediaPolicy(media.origin)) : framePolicy;
  const html = cleanHtml(section.html);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:16px/1.6 system-ui;color:#172033;background:#fff;overflow-wrap:anywhere}*{box-sizing:border-box}img,video{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{padding:8px;border:1px solid #ddd}pre{white-space:pre-wrap}${cleanCss(section.css)}</style></head><body>${media ? embedMedia(html, media.token, media.origin, media.thumbnail) : html}</body></html>`;
}
