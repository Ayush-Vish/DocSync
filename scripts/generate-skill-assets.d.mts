export interface SkillAssets { motionJs: string; motionCss: string; guide: Record<"overview" | "motion" | "research-talk" | "mcp", string> }
export function skillAssets(): SkillAssets;
export const SKILL_ASSETS_PATH: URL;
export function writeSkillAssets(): void;
