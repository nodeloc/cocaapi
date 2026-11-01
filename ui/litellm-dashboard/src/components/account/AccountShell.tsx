import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
        <CardContent className="flex flex-col gap-6">
          <div className="text-center space-y-2">
            <a href="/account/login/" className="text-3xl font-semibold text-foreground">
              CocaAPI
            </a>
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
    <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"}>
      <AlertDescription>{error || message}</AlertDescription>
    </Alert>
  );
}
