import {
  BookOpen,
  CalendarDays,
  CloudSun,
  Coins,
  FlaskConical,
  Gamepad2,
  GraduationCap,
  MapPin,
  Palette,
  PawPrint,
  Plug,
  Smile,
  Tv,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Most specific first: an API tagged "fun" and "animals" shows as animals.
const BY_TAG: [string, LucideIcon][] = [
  ["weather", CloudSun],
  ["finance", Coins],
  ["calendar", CalendarDays],
  ["food", UtensilsCrossed],
  ["animals", PawPrint],
  ["art", Palette],
  ["culture", Palette],
  ["tv", Tv],
  ["entertainment", Tv],
  ["games", Gamepad2],
  ["education", GraduationCap],
  ["language", BookOpen],
  ["geo", MapPin],
  ["testing", FlaskConical],
  ["demo", FlaskConical],
  ["fun", Smile],
  ["reference", BookOpen],
];

/** Icons by category, plus "default" for APIs with no recognised tag. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = { ...Object.fromEntries(BY_TAG), default: Plug };

/** The category an API's icon comes from: its most specific recognised tag. */
export function categoryKey(tags: readonly string[] | undefined): string {
  const lower = (tags ?? []).map((t) => t.toLowerCase());
  return BY_TAG.find(([tag]) => lower.includes(tag))?.[0] ?? "default";
}

/** The label for an API's category column: the tag its icon comes from. */
export function categoryLabel(tags: readonly string[] | undefined): string {
  const key = categoryKey(tags);
  return key === "default" ? (tags?.[0] ? tagLabel(tags[0]) : "—") : tagLabel(key);
}

export function tagLabel(tag: string): string {
  return tag === "tv" ? "TV" : tag.charAt(0).toUpperCase() + tag.slice(1);
}
