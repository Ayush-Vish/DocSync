import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import * as cssTree from 'css-tree';
import { contentSchema, type Content } from './document.ts';
export type { Content, Document } from './document.ts';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message); this.status = status; this.details = details;
  }
}

const tags = new Set('article section div span p h1 h2 h3 h4 h5 h6 header footer main aside nav strong em b i u s small mark sub sup blockquote pre code ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col hr br details summary figure figcaption'.split(' '));
const attrs = new Set('id class title role aria-label aria-hidden aria-describedby colspan rowspan scope start reversed open'.split(' '));
const cssAtRules = new Set(['media', 'supports', 'container', 'layer']);

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
      node.attrs = node.attrs.filter(attr => !attr.namespace && (attrs.has(attr.name) || attr.name === 'style')).map(attr => attr.name === 'style' ? { ...attr, value: cleanCss(attr.value, true) } : attr);
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
  if (new Set(value.sections.map(s => s.id)).size !== value.sections.length) throw new HttpError(400, 'Section IDs must be unique');
  if (new TextEncoder().encode(JSON.stringify(value)).length > 500_000) throw new HttpError(413, 'Document exceeds 500 KB');
  return { title: value.title, sections: value.sections.map(s => ({ ...s, html: cleanHtml(s.html), css: cleanCss(s.css) })) };
}

export const framePolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'";
export function frameSource(section: Content['sections'][number]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${framePolicy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:16px/1.6 system-ui;color:#172033;background:#fff;overflow-wrap:anywhere}*{box-sizing:border-box}table{border-collapse:collapse;max-width:100%}td,th{padding:8px;border:1px solid #ddd}pre{white-space:pre-wrap}${cleanCss(section.css)}</style></head><body>${cleanHtml(section.html)}</body></html>`;
}
