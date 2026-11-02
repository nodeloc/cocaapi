"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { PlusIcon, TrashIcon } from "lucide-react";
import { Tool } from "./types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ToolsCardProps {
  tools: Tool[];
  onAddTool: () => void;
  onEditTool: (index: number) => void;
  onRemoveTool: (index: number) => void;
}

const ToolsCard: React.FC<ToolsCardProps> = ({ tools, onAddTool, onEditTool, onRemoveTool }) => {
  useUiLocale();
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">
          <LocalizedText text={"Tools"} />
        </p>
        <Button variant="ghost" size="sm" onClick={onAddTool}>
          <PlusIcon size={14} className="mr-1" />
          <LocalizedText text={"Add"} />
        </Button>
      </div>
      {tools.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          <LocalizedText text={"No tools added"} />
        </p>
      ) : (
        <div className="space-y-2">
          {tools.map((tool, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-muted border border-border rounded-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs truncate">{tool.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {localizedProperty(tool, "description", tool.description)}
                </div>
              </div>
              <div className="flex items-center space-x-1 ml-2">
                <Button variant="ghost" size="sm" onClick={() => onEditTool(index)}>
                  <LocalizedText text={"Edit"} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translateMessage("Remove %{0}", [tool.name])}
                  onClick={() => onRemoveTool(index)}
                >
                  <TrashIcon size={14} aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default ToolsCard;
