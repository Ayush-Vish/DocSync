export interface TemplateSection { id: string; kind: "html"; html: string; css: string; js: string }
export function toDocument(directory: string, title: string, media?: Record<string, string>): { title: string; format: "presentation" | "document"; sections: TemplateSection[] };
