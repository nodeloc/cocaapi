import { cx } from "@/lib/cva.config";
import { UiLoadingSpinner } from "../ui/ui-loading-spinner";
import { CocaApiLogo } from "./CocaApiLogo";

export default function LoadingScreen() {
  return (
    <div className={cx("h-screen", "flex items-center justify-center gap-4")}>
      <div className="py-2 pr-4 border-r border-r-gray-200">
        <CocaApiLogo className="w-[120px]" />
      </div>

      <div className="flex items-center justify-center gap-2">
        <UiLoadingSpinner className="size-4" />
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    </div>
  );
}
