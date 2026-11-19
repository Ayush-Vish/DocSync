export interface SlidePattern { id: string; use: string; blocks: string; builds: string; html: string }
export interface SkillAssets { motionJs: string; motionCss: string; researchCss: string; patterns: SlidePattern[]; guide: Record<"overview" | "motion" | "research-talk" | "mcp", string> }
export function skillAssets(): SkillAssets;
export const SKILL_ASSETS_PATH: URL;
export function writeSkillAssets(): void;
