"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const ThemeToggle: React.FC = () => {
  const { setTheme, resolvedTheme } = useTheme();
  // Saved preferences are unavailable during export; keep the first render identical.
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const isDark = hydrated && resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode (beta)";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className="text-muted-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Moon /> : <Sun />}
    </Button>
  );
};

export default ThemeToggle;
