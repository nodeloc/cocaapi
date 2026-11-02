"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { useDisableShowNewBadge } from "@/app/(dashboard)/hooks/useDisableShowNewBadge";

export default function BetaBadge({ children, dot = false }: { children?: React.ReactNode; dot?: boolean }) {
  useUiLocale();
  const disableShowNewBadge = useDisableShowNewBadge();

  if (disableShowNewBadge) {
    return children ? <>{children}</> : null;
  }

  const badge = dot ? (
    <Badge className="size-1.5 p-0" />
  ) : (
    <Badge>
      <LocalizedText text={"Beta"} />
    </Badge>
  );

  return children ? (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {badge}
    </span>
  ) : (
    badge
  );
}
