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

export interface Category {
  icon: LucideIcon;
  /** A .tone-* class from globals.css. */
  tone: string;
}

// Most specific first: an API tagged "fun" and "animals" shows as animals.
const BY_TAG: [string, Category][] = [
  ["weather", { icon: CloudSun, tone: "tone-sky" }],
  ["finance", { icon: Coins, tone: "tone-emerald" }],
  ["calendar", { icon: CalendarDays, tone: "tone-rose" }],
  ["food", { icon: UtensilsCrossed, tone: "tone-amber" }],
  ["animals", { icon: PawPrint, tone: "tone-orange" }],
  ["art", { icon: Palette, tone: "tone-fuchsia" }],
  ["culture", { icon: Palette, tone: "tone-fuchsia" }],
  ["tv", { icon: Tv, tone: "tone-violet" }],
  ["entertainment", { icon: Tv, tone: "tone-violet" }],
  ["games", { icon: Gamepad2, tone: "tone-violet" }],
  ["education", { icon: GraduationCap, tone: "tone-indigo" }],
  ["language", { icon: BookOpen, tone: "tone-indigo" }],
  ["geo", { icon: MapPin, tone: "tone-teal" }],
  ["testing", { icon: FlaskConical, tone: "tone-sky" }],
  ["demo", { icon: FlaskConical, tone: "tone-sky" }],
  ["fun", { icon: Smile, tone: "tone-orange" }],
  ["reference", { icon: BookOpen, tone: "tone-slate" }],
];

const DEFAULT: Category = { icon: Plug, tone: "tone-indigo" };

/** Icon and colour for an API, from its WSO2 tags. */
export function categoryFor(tags: readonly string[] | undefined): Category {
  const lower = (tags ?? []).map((t) => t.toLowerCase());
  return BY_TAG.find(([tag]) => lower.includes(tag))?.[1] ?? DEFAULT;
}

export function tagLabel(tag: string): string {
  return tag === "tv" ? "TV" : tag.charAt(0).toUpperCase() + tag.slice(1);
}
