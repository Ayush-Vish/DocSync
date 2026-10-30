import { z } from "zod";

export const sectionSchema = z
  .object({
    kind: z.enum(["text", "html"]).optional(),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    html: z.string().max(100_000),
    css: z.string().max(30_000),
    js: z.string().max(50_000).optional(),
  })
  .strict();
export const contentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    format: z.enum(["document", "presentation"]).optional().describe("Document renders as separate paper pages; presentation renders as slides."),
    pages: z.array(sectionSchema).min(1).max(40).optional().describe("Ordered document pages. Each item is one complete page with a stable id and self-contained HTML/CSS/JS. Use pages OR sections, never both. Split long reports across pages."),
    sections: z.array(sectionSchema).max(40).default([]).describe("Legacy document pages or presentation slides. Omit when providing pages."),
  })
  .strict();
export type Content = z.infer<typeof contentSchema>;
export type Document = Content & {
  id: string;
  revision: number;
  updated_at: string;
};
