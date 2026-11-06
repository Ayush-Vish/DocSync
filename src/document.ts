import { z } from "zod";

export const sectionSchema = z
  .object({
    kind: z.enum(["text", "html"]).optional(),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    html: z.string().max(100_000),
    css: z.string().max(30_000),
    js: z.string().max(50_000).optional().describe("Independent page/slide JavaScript for animations and interactions. Use DOM APIs or the Web Animations API, respect reduced motion, and keep meaningful content in HTML. Runs in an isolated sandbox without network or account access."),
  })
  .strict();
export const contentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    format: z.enum(["document", "presentation"]).optional().describe("Document renders as separate paper pages; presentation renders as slides."),
    pages: z.array(sectionSchema).min(1).max(40).optional().describe("Ordered document pages or presentation slides. Each item is one page/slide with a stable id and self-contained HTML/CSS/JS."),
    sections: z.array(sectionSchema).max(40).default([]).describe("Alias for pages. For backward compatibility. Provide pages or sections, not both."),
  })
  .strict();
export type Content = z.infer<typeof contentSchema>;
export type DocumentAccess = "owner" | "editor" | "viewer";
export type EditLock = { leaseId: string; holder: string; agent: string; expiresAt: number };
export type EditLease = EditLock & { lockToken: string; revision: number };
export type Revision = { revision: number; created_at: string; author: string | null; agent: string | null; parent_revision: number | null; summary: string; restored_from: number | null };
export type Document = Content & {
  id: string;
  revision: number;
  updated_at: string;
  warnings?: string[];
  access?: DocumentAccess;
};
