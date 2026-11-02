import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/shared/Alert";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { CocaApiLogo } from "@/components/common_components/CocaApiLogo";

export function AccountShell({
  title,
  description,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main lang="zh-CN" className="min-h-screen flex items-center justify-center bg-muted px-4 py-10">
      <Card className={`w-full shadow-md ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <CardContent className="flex flex-col gap-4">
          <div className="text-center">
            <a href="/account/login/" aria-label="CocaAPI 登录" className="inline-flex py-2">
              <CocaApiLogo />
            </a>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

export function AccountNotice({ error, message }: { error: string; message: string }) {
  if (!error && !message) return null;
  return (
    <div className="space-y-2">
      {message && (
        <Alert variant="success" role="status">
          <CheckCircle2 />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="error" role="alert">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
