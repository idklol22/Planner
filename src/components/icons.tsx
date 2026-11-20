import {
  BookOpen,
  Briefcase,
  Coffee,
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
