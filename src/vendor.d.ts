declare module 'css-tree' {
 export function parse(css: string, options?: Record<string, unknown>): any;
 export function walk(ast: any, callback: (node: any) => void): void;
 export function generate(ast: any): string;
}
