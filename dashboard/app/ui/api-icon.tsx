import { CATEGORY_ICONS, categoryKey } from "@/lib/categories";

const SIZES = { sm: "size-8 [&>svg]:size-4", md: "size-10 [&>svg]:size-[18px]", lg: "size-12 [&>svg]:size-5" };

export function ApiIcon({ tags, size = "md" }: { tags?: readonly string[]; size?: keyof typeof SIZES }) {
  const Icon = CATEGORY_ICONS[categoryKey(tags)];
  return (
    <span className={`icon-tile ${SIZES[size]}`}>
      <Icon aria-hidden strokeWidth={1.6} />
    </span>
  );
}
