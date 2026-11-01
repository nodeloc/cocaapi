import type { Access, Keys } from "../gatewayApi";
import type { Profile } from "../accountApi";

export function nativeKey(key: Keys["items"][number], profile: Profile, access: Access) {
  return {
    token: key.id,
    token_id: key.id,
    api_key: key.id,
    key_name: key.name,
    key_alias: key.name,
    spend: key.spend_usd,
    total_spend: key.total_spend_usd,
    last_active: key.last_active_at,
    rpm_limit: key.rpm_limit,
    tpm_limit: key.tpm_limit,
    tpd_limit: key.tpd_limit,
    max_budget: key.max_budget_usd,
    budget_duration: key.budget_duration,
    budget_reset_at: key.budget_reset_at,
    expires: key.expires_at,
    created_at: key.created_at,
    models: key.models,
    blocked: key.blocked,
    user_id: profile.user_id,
    user_email: profile.email,
    team_id: null,
    organization_id: null,
    project_id: null,
    key_type: "llm_api",
    allowed_routes: ["llm_api_routes"],
    metadata: {},
    permissions: {},
    aliases: {},
    config: {},
    model_spend: {},
    model_max_budget: {},
    allowed_cache_controls: [],
    access_group_ids: [],
    user: {
      user_id: profile.user_id,
      user_email: profile.email,
      user_alias: null,
      max_budget: access.max_budget_usd,
      budget_duration: access.budget_duration,
    },
    user_tpm_limit: access.tpm_limit,
    user_rpm_limit: access.rpm_limit,
  };
}

export function nativeUser(profile: Profile, access: Access) {
  return {
    user_id: profile.user_id,
    user_email: profile.email,
    user_alias: null,
    user_role: "internal_user",
    models: access.models,
    max_budget: access.max_budget_usd,
    spend: access.spend_usd,
    tpm_limit: access.tpm_limit,
    rpm_limit: access.rpm_limit,
    budget_reset_at: access.budget_reset_at,
    budget_duration: access.budget_duration,
    teams: [],
    organization_memberships: [],
    metadata: { commerce: true },
  };
}

export function nativeModels(access: Access) {
  return access.models.map((name) => ({
    model_name: name,
    litellm_params: {},
    model_info: { id: name, direct_access: true, access_via_team_ids: [] },
  }));
}
