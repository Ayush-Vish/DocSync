import { z } from 'zod';

export const sectionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  html: z.string().max(100_000),
  css: z.string().max(30_000),
}).strict();
export const contentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sections: z.array(sectionSchema).min(1).max(40),
}).strict();
export type Content = z.infer<typeof contentSchema>;
export type Document = Content & { id: string; revision: number; updated_at: string };
