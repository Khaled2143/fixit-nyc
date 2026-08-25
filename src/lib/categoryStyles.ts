import {
  CircleDot,
  LightbulbOff,
  Trash2,
  SprayCan,
  Construction,
  TreeDeciduous,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import type { IssueCategory } from "@/types/issue";

interface CategoryStyle {
  icon: LucideIcon;
  hue: number;
  chroma: number;
}

export const CATEGORY_STYLES: Record<IssueCategory, CategoryStyle> = {
  Pothole: { icon: CircleDot, hue: 45, chroma: 0.15 },
  "Broken streetlight": { icon: LightbulbOff, hue: 90, chroma: 0.15 },
  "Illegal dumping": { icon: Trash2, hue: 150, chroma: 0.15 },
  Graffiti: { icon: SprayCan, hue: 200, chroma: 0.15 },
  "Damaged sidewalk": { icon: Construction, hue: 250, chroma: 0.15 },
  "Downed tree/branch": { icon: TreeDeciduous, hue: 300, chroma: 0.15 },
  Other: { icon: CircleHelp, hue: 250, chroma: 0.02 },
};

export function categoryColor(category: IssueCategory, colorScheme: "light" | "dark"): string {
  const { hue, chroma } = CATEGORY_STYLES[category];
  const lightness = colorScheme === "dark" ? 0.68 : 0.6;
  return `oklch(${lightness} ${chroma} ${hue})`;
}
