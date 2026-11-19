import type { Database } from "./platform.ts";
import { cleanCss, cleanHtml, HttpError, type Content } from "./content.ts";
import { companyTemplateFormat, companyTemplateId, saveCompanyTemplateSchema, type CompanyTemplateFormat, type CompanyTemplateRecipe } from "./company-template-schema.ts";
import { mediaReferences } from "./media-url.ts";
import themes from "../skills/docsync/themes.json" with { type: "json" };
import designTokens from "../skills/docsync/themes/design-tokens.json" with { type: "json" };

type TemplateSummary = { format: CompanyTemplateFormat; id: string; name: string };

export async function templateOptions(db: Database, accountId: string, trial: boolean, url: URL) {
  const filter = url.searchParams.get("format") ?? "all";
  if (filter !== "all" && !companyTemplateFormat.safeParse(filter).success) throw new HttpError(400, "Invalid template format");
  const { results: rows } = await db.prepare("SELECT format,id,name FROM company_templates WHERE account_id=?")
    .bind(accountId).all<TemplateSummary | { format: CompanyTemplateFormat; id: null; name: null }>();
  const formats = companyTemplateFormat.options.filter(format => filter === "all" || filter === format);
  const pending = formats.filter(format => !rows.some(row => row.format === format));
  const companyTemplates = rows.filter(row => row.id !== null && formats.includes(row.format));
  return {
    galleryUrl: new URL(`/templates?format=${filter}`, url).href,
    linkAccess: url.protocol === "http:" ? "local_only" : "public",
    question: companyTemplates.length
      ? "Would you like to use your saved template, choose from the DocSync gallery, or have me design it for your request?"
      : "Would you like to use a template from the DocSync gallery, or should I design it for your request?",
    companyTemplates,
    canSaveTemplates: !trial,
    companyTemplateSetup: pending.length ? {
      formats: pending,
      question: `Do you have a template or example you'd like me to follow for ${pending.length === 2 ? "documents or presentations" : `${pending[0]}s`}? If so, you can share a PDF, PowerPoint, Word file, or another reference. If you don't have one or would rather skip, I can choose a design for you.`,
    } : null,
    guidance: "If the user asks for their saved template, including ‘use my company template’, call get_company_template for this format. If none is saved, ask for a reference or an explicit change of design. Otherwise offer saved templates alongside the gallery. Include the optional companyTemplateSetup question in the first relevant design prompt if the user is still choosing a design. If they have no template or skip setup, call skip_company_template_setup and continue with their preferred design, choose a suitable gallery template, or create a custom design. Templates can be personal, academic, or organizational. A shared reference can be used for the current artifact. If the user wants to save it for future requests, use save_company_template when canSaveTemplates is true. Otherwise explain the sign-in option. For a gallery choice, start from the template's contentUrl and replace all example content.",
    themes: Object.keys(designTokens.themes),
    templates: themes.filter(theme => filter === "all" || theme.format === filter).map(theme => ({
      id: theme.id, name: theme.name, format: theme.format, description: theme.description, suggestedTheme: theme.suggestedTheme,
      previewUrl: new URL(`/downloads/docsync/assets/templates/${theme.id}/index.html`, url).href,
      contentUrl: new URL(`/downloads/docsync/themes/${theme.id}.json`, url).href,
    })),
  };
}

function missingTemplate() {
  return new HttpError(404, "No matching company template is available. Ask for a reference or confirm a different template with the user.", { code: "COMPANY_TEMPLATE_NOT_FOUND" });
}

export async function getCompanyTemplate(db: Database, accountId: string, format: CompanyTemplateFormat) {
  const row = await db.prepare("SELECT id,name,recipe FROM company_templates WHERE account_id=? AND format=? AND id IS NOT NULL")
    .bind(accountId, format).first<{ id: string; name: string; recipe: string }>();
  if (!row) throw missingTemplate();
  const { recipe, ...summary } = row;
  return { ...JSON.parse(recipe) as CompanyTemplateRecipe, ...summary, format };
}

export async function saveCompanyTemplate(db: Database, accountId: string, format: CompanyTemplateFormat, input: unknown) {
  const parsed = saveCompanyTemplateSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid company template", parsed.error.flatten());
  const { name, replaceTemplateId, instructions } = parsed.data;
  const css = cleanCss(parsed.data.css);
  if (!css || css.length > 30_000) throw new HttpError(400, "Company template needs usable CSS within 30,000 characters");
  const layouts = parsed.data.layouts.map(layout => {
    const html = cleanHtml(layout.html).trim();
    if (!html.startsWith("<") || mediaReferences(html).length) throw new HttpError(400, "Use standalone HTML layouts with placeholders for document media");
    return { name: layout.name, html };
  });
  const recipe = JSON.stringify({ instructions, css, layouts });
  const id = crypto.randomUUID();
  const write = replaceTemplateId
    ? db.prepare("UPDATE company_templates SET id=?,name=?,recipe=? WHERE account_id=? AND format=? AND id=?")
      .bind(id, name, recipe, accountId, format, replaceTemplateId)
    : db.prepare(`INSERT INTO company_templates(account_id,format,id,name,recipe) VALUES(?,?,?,?,?)
      ON CONFLICT(account_id,format) DO UPDATE SET id=excluded.id,name=excluded.name,recipe=excluded.recipe WHERE company_templates.id IS NULL`)
      .bind(accountId, format, id, name, recipe);
  if (!(await write.run()).meta.changes) throw new HttpError(409, "A company template already exists or changed. Read the current template before replacing it.", { code: "COMPANY_TEMPLATE_CONFLICT" });
  return { id, format, name };
}

export async function skipCompanyTemplateSetup(db: Database, accountId: string, format: CompanyTemplateFormat) {
  await db.prepare("INSERT INTO company_templates(account_id,format) VALUES(?,?) ON CONFLICT(account_id,format) DO NOTHING").bind(accountId, format).run();
  return { ok: true };
}

export async function applyCompanyTemplate(db: Database, accountId: string, inputId: unknown, format: unknown, content: Content): Promise<Content> {
  const id = companyTemplateId.safeParse(inputId), output = companyTemplateFormat.safeParse(format);
  if (!id.success || !output.success) throw new HttpError(400, "A valid companyTemplateId and explicit document format are required");
  const template = await getCompanyTemplate(db, accountId, output.data);
  if (template.id !== id.data) throw missingTemplate();
  const sections = content.sections.map(section => {
    const css = section.css ? `${template.css}\n${section.css}` : template.css;
    if (css.length > 30_000) throw new HttpError(400, `Section '${section.id}' exceeds the CSS limit once the company template is applied. Reduce its page-specific CSS.`);
    return { ...section, css };
  });
  return { ...content, sections };
}
