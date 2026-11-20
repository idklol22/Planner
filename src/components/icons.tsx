import {
  BookOpen,
  Briefcase,
  Coffee,
  createLucideIcon,
  Dumbbell,
  FlaskConical,
  Heart,
  Home,
  Music,
  Code2,
  ShoppingCart,
  Star,
  Sun,
  Tag,
  type LucideIcon,
} from "lucide-react";

/** lucide's CalendarArrowRight, added after the pinned lucide-react release. */
export const CalendarArrowRight = createLucideIcon("CalendarArrowRight", [
  ["path", { d: "M16 2v3" }],
  ["path", { d: "m18 21 3-3h-6" }],
  ["path", { d: "M21 12.34V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.35" }],
  ["path", { d: "m21 18-3-3" }],
  ["path", { d: "M3 9h18" }],
  ["path", { d: "M8 2v3" }],
]);

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  work: Briefcase,
  gym: Dumbbell,
  home: Home,
  heart: Heart,
  code: Code2,
  music: Music,
  shop: ShoppingCart,
  star: Star,
  sun: Sun,
  coffee: Coffee,
  lab: FlaskConical,
};

export function CategoryIcon({
  name,
  size = 16,
  color,
}: {
  name?: string;
  size?: number;
  color?: string;
}) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}
