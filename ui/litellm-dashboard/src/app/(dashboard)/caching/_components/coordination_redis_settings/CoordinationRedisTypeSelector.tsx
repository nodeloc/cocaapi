"use client";
import { LocalizedText, localizedProperty, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COORDINATION_REDIS_TYPES,
  COORDINATION_REDIS_TYPE_DESCRIPTIONS,
  COORDINATION_REDIS_TYPE_LABELS,
  CoordinationRedisType,
} from "./coordinationRedisFields";

interface CoordinationRedisTypeSelectorProps {
  redisType: CoordinationRedisType;
  onTypeChange: (type: CoordinationRedisType) => void;
}

const CoordinationRedisTypeSelector: React.FC<CoordinationRedisTypeSelectorProps> = ({ redisType, onTypeChange }) => {
  useUiLocale();
  return (
    <div className="space-y-2">
      <label htmlFor="coordination-redis-type" className="text-sm font-medium">
        <LocalizedText text={"Redis Type"} />
      </label>
      <Select value={redisType} onValueChange={(value) => value !== null && onTypeChange(value)}>
        <SelectTrigger id="coordination-redis-type" className="w-full">
          <SelectValue>
            {localizedProperty(COORDINATION_REDIS_TYPE_LABELS, redisType, COORDINATION_REDIS_TYPE_LABELS[redisType])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COORDINATION_REDIS_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {localizedProperty(COORDINATION_REDIS_TYPE_LABELS, type, COORDINATION_REDIS_TYPE_LABELS[type])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {localizedProperty(
          COORDINATION_REDIS_TYPE_DESCRIPTIONS,
          redisType,
          COORDINATION_REDIS_TYPE_DESCRIPTIONS[redisType],
        )}
      </p>
    </div>
  );
};

export default CoordinationRedisTypeSelector;
