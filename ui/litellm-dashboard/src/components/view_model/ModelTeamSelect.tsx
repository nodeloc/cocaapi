"use client";
import { localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Team } from "../key_team_helpers/key_list";

interface ModelTeamSelectProps {
  id: string;
  value: string | undefined;
  onChange: (teamId: string) => void;
  onBlur: () => void;
  teams: Team[] | null;
}

export const ModelTeamSelect: React.FC<ModelTeamSelectProps> = ({ id, value, onChange, onBlur, teams }) => {
  useUiLocale();
  const items = (teams ?? []).map((team) => ({
    value: team.team_id,
    label: team.team_alias ? `${team.team_alias} (${team.team_id})` : team.team_id,
  }));
  return (
    <Select items={items} value={value || null} onValueChange={(selected: string | null) => onChange(selected ?? "")}>
      <SelectTrigger id={id} className="w-full" onBlur={onBlur}>
        <SelectValue placeholder={translateMessage("Select a team")} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {localizedProperty(item, "label", item.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
