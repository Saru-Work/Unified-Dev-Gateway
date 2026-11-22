import { categoryFor } from "@/lib/categories";

const SIZES = { sm: "size-9 [&>svg]:size-4", md: "size-11 [&>svg]:size-5", lg: "size-14 [&>svg]:size-7" };

export function ApiIcon({ tags, size = "md" }: { tags?: readonly string[]; size?: keyof typeof SIZES }) {
  const { icon: Icon, tone } = categoryFor(tags);
  return (
    <span className={`icon-tile ${tone} ${SIZES[size]}`}>
      <Icon aria-hidden />
    </span>
  );
}
