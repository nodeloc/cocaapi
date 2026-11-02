"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_PROXY_ADMIN_USER_ID } from "@/utils/sentinels";

interface DefaultProxyAdminTagProps {
  userId: string | null | undefined;
}

export default function DefaultProxyAdminTag({ userId }: DefaultProxyAdminTagProps) {
  useUiLocale();
  if (userId === DEFAULT_PROXY_ADMIN_USER_ID) {
    return (
      <Badge variant="secondary">
        <LocalizedText text={"Default Proxy Admin"} />
      </Badge>
    );
  }

  return <span>{userId}</span>;
}
