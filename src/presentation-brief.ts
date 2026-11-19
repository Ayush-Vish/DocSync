// The presentation brief: the questions every agent asks before building a deck, and the checks that hold an
// animated deck to the research-talk benchmark. Enforced in the MCP tools (not in server instructions) because
// some agents never read MCP instructions, but every agent sees tool schemas and tool errors.
import { z } from "zod";

export const briefSchema = z.object({
  answeredBy: z.enum(["user", "defaults"]).describe("user = the user answered plan_presentation's questions; defaults = the user explicitly said to decide for them."),
  audience: z.string().trim().min(1).max(200).describe("Who will watch and what they already know."),
  depth: z.enum(["overview", "standard", "deep", "expert"]),
  slideCount: z.number().int().min(1).max(40),
  animation: z.enum(["full", "subtle", "none"]),
  style: z.enum(["explainer", "pitch", "review", "custom"]),
  speakerNotes: z.boolean(),
}).describe("Required for presentations: the user's answers from plan_presentation. Call plan_presentation first and ask the user.");
export type Brief = z.infer<typeof briefSchema>;

export const briefDefaults: Omit<Brief, "answeredBy" | "audience"> = { depth: "standard", slideCount: 10, animation: "full", style: "explainer", speakerNotes: true };

export const briefQuestions = [
  { key: "depth", question: "How much detail should each slide have?", default: "standard", options: {
    overview: "Big picture for a general audience: what it is and why it matters, one simple diagram per idea, no jargon.",
    standard: "How it works: the main parts and the flow between them, key terms defined, a few real numbers.",
    deep: "Internals: protocols, message or frame sequences, algorithms and trade-offs; diagrams walk through each step.",
    expert: "Specialist: field-level detail, maths, edge cases and limits, with cited sources.",
  } },
  { key: "slideCount", question: "How many slides?", default: 10 },
  { key: "animation", question: "Should the slides be animated?", default: "full", options: {
    full: "Yes, fully (the benchmark): every slide builds step by step, and diagrams draw their own arrows with data packets moving along them.",
    subtle: "Lightly: items appear step by step, no moving packets.",
    none: "No animation: static slides, best for printing or PDF.",
  } },
  { key: "style", question: "Which look?", default: "explainer", options: {
    explainer: "Technical explainer: clean white canvas, labelled diagrams and icons (the research-talk template). Best for 'how X works'.",
    pitch: "Bold dark slides for a story or pitch (pitch-deck template).",
    review: "Warm status or review slides (review-slides template).",
    custom: "Describe your own colours and mood.",
  } },
  { key: "audience", question: "Who is the audience, and what do they already know?", default: "a general audience with no specialist background" },
  { key: "speakerNotes", question: "Add speaker notes with a script for each slide?", default: true },
] as const;

export const askHow = "Ask the user these questions before building, in one message (or your client's question/choice UI), showing each option and the default. Skip any question the user already answered in their request. If the user says to decide for them, use the defaults and set answeredBy to \"defaults\". A selected company template answers the style question (custom). If the user delegates animation for a company template, choose the animation that matches its layout and pacing. Then pass the answers as brief to create_document.";

export const depthGuide = {
  overview: "One idea per slide in plain words; analogies welcome; at most one number per slide.",
  standard: "Name the components, show how data or control flows between them, define each term once, include a few concrete figures.",
  deep: "Walk through the internal sequence step by step (handshakes, frames, state machines, algorithms); show what each field or stage does and the trade-offs.",
  expert: "Specification-level: exact message fields, timings, formulas, failure modes and limits; cite the standard or paper for every figure.",
};

export const animationGuide = {
  full: "Benchmark (research-talk): put \"motion\" on every slide root; give each content slide 2-6 build steps (s1, s2, ...) that follow the narration; draw every flow or process as .wire paths with draw, and move data along at least one of them with pk-doc / pk-msg / pk-dot. Use get_slide_patterns for working examples.",
  subtle: "Put \"motion\" on every slide root and reveal content with 1-4 build steps (f up, dim, wr). Wires optional, no packets needed.",
  none: "Static slides. Do not add motion classes.",
};

const rootClasses = (html: string) => new Set((/^\s*<[a-z][\w-]*\b[^>]*?\sclass\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ?? "").split(/\s+/).filter(Boolean));
const stepCount = (html: string) => new Set([...html.matchAll(/\sclass\s*=\s*["']([^"']*)["']/gi)].flatMap(m => m[1].split(/\s+/)).filter(c => /^s\d{1,2}$/.test(c))).size;
const hasClassWith = (html: string, ...names: string[]) => [...html.matchAll(/\sclass\s*=\s*["']([^"']*)["']/gi)].some(m => { const set = new Set(m[1].split(/\s+/)); return names.every(n => set.has(n)); });

/** Problems that keep a deck from meeting its brief. Empty when it passes. */
export function checkPresentation(sections: { id: string; html: string }[], brief: Brief): string[] {
  const problems: string[] = [];
  if (sections.length !== brief.slideCount) problems.push(`The brief asks for ${brief.slideCount} slides but ${sections.length} were sent. Match the brief, or update brief.slideCount if the user agreed to a change.`);
  if (brief.style === "explainer") for (const s of sections) if (!rootClasses(s.html).has("research")) problems.push(`Slide '${s.id}': style "explainer" needs class "research" on the slide root (<article class="slide research motion">) so DocSync attaches the research-talk design system. Build it from get_slide_patterns.`);
  if (brief.animation === "none") return problems;
  sections.forEach((s, i) => {
    const content = i > 0 && i < sections.length - 1; // the title and closing slides may only use entrance effects
    if (!rootClasses(s.html).has("motion")) problems.push(`Slide '${s.id}': animation "${brief.animation}" needs class "motion" on the slide root.`);
    const steps = stepCount(s.html), min = brief.animation === "full" ? 2 : 1;
    if (content && steps < min) problems.push(`Slide '${s.id}': ${steps} build step(s); animation "${brief.animation}" needs at least ${min} (classes s1, s2, ... in the order you would explain them).`);
  });
  if (brief.animation === "full") {
    const drawn = sections.filter(s => hasClassWith(s.html, "wire", "draw")).length, needed = Math.max(2, Math.ceil(sections.length / 3));
    if (drawn < needed) problems.push(`Only ${drawn} slide(s) have self-drawing arrows; the full-animation benchmark needs at least ${needed}. Draw each flow or process as <span class="wire c-amber draw s2" style='--path:"M x1 y1 H x2"'></span> between the boxes it connects.`);
    if (!sections.some(s => /\bpk-(doc|msg|dot)\b/.test(s.html))) problems.push(`No data packets move anywhere in the deck. Add pk-doc, pk-msg or pk-dot to at least one wire that carries data (for example a frame travelling from a device to the access point).`);
  }
  return problems;
}
