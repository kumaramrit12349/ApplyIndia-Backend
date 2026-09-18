import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { EMAIL_CHANNEL, PLATFORM_SETTINGS_SK } from "../../db_schema/PlatformSettings/PlatformSettingsConstant";
import { IPlatformSettings } from "../../db_schema/PlatformSettings/PlatformSettingsInterface";
import { logErrorLocation } from "../../utils/errorUtils";

const DEFAULT_SETTINGS: IPlatformSettings = {
  email_communication_enabled: true,
  contact_us_enabled: true,
  guidance_enabled: true,
  notification_enabled: true,
};

/** Maps each channel to the settings field that gates it — the one place that association lives. */
const CHANNEL_FIELD: Record<EMAIL_CHANNEL, keyof IPlatformSettings> = {
  [EMAIL_CHANNEL.CONTACT_US]: "contact_us_enabled",
  [EMAIL_CHANNEL.GUIDANCE]: "guidance_enabled",
  [EMAIL_CHANNEL.NOTIFICATION]: "notification_enabled",
};

export async function getPlatformSettings(): Promise<IPlatformSettings> {
  const results = await fetchDynamoDB<IPlatformSettings>(ALL_TABLE_NAMES.PlatformSettings, PLATFORM_SETTINGS_SK, ["*"]);
  // Merge over defaults rather than returning the raw row as-is — an
  // existing row saved before a new channel field was introduced would
  // otherwise come back with that field `undefined` (falsy), silently
  // disabling a channel nobody ever actually turned off.
  return results && results.length > 0 ? { ...DEFAULT_SETTINGS, ...results[0] } : DEFAULT_SETTINGS;
}

export async function updatePlatformSettings(
  updates: Partial<Omit<IPlatformSettings, "pk" | "sk" | "created_at">>
): Promise<IPlatformSettings> {
  const existing = await fetchDynamoDB<IPlatformSettings>(ALL_TABLE_NAMES.PlatformSettings, PLATFORM_SETTINGS_SK, ["sk"]);
  if (!existing || existing.length === 0) {
    const now = Date.now();
    const item: IPlatformSettings = {
      ...DEFAULT_SETTINGS,
      ...updates,
      pk: TABLE_PK_MAPPER.PlatformSettings,
      sk: PLATFORM_SETTINGS_SK,
      created_at: now,
      modified_at: now,
    };
    await insertDataDynamoDB(ALL_TABLE_NAMES.PlatformSettings, item);
    invalidatePlatformSettingsCache();
    return item;
  }

  await updateDynamoDB(TABLE_PK_MAPPER.PlatformSettings, PLATFORM_SETTINGS_SK, updates);
  invalidatePlatformSettingsCache();
  return getPlatformSettings();
}

/*
 * In-memory cache for the settings sendEmail() needs to check on every
 * single send — mirrors authMiddleware.ts's admin-role cache (refresh-on-
 * TTL-expiry + explicit invalidate-on-mutation), caching the whole small
 * settings object rather than a Map since there's only ever one row.
 *
 * Each warm Lambda container holds its own copy of this module, so
 * invalidatePlatformSettingsCache() (called right after a write, in the same
 * request) only clears the cache in the container that handled that write —
 * other already-warm containers keep serving their stale cached value until
 * this short TTL naturally expires. That's the same eventual-consistency
 * tradeoff refreshAdminRolesCache already accepts; a 60s TTL keeps the
 * cross-container lag short without a DB round-trip on every email.
 */
let cachedSettings: IPlatformSettings | null = null;
let cacheLastRefreshed = 0;
const CACHE_TTL = 60 * 1000;

async function ensureSettingsCache(): Promise<IPlatformSettings> {
  if (cachedSettings === null || Date.now() - cacheLastRefreshed > CACHE_TTL) {
    try {
      cachedSettings = await getPlatformSettings();
      cacheLastRefreshed = Date.now();
    } catch (error) {
      logErrorLocation("platformSettingsService.ts", "ensureSettingsCache", error, "Failed to refresh platform settings cache — keeping stale/default value", "", {});
      // Fail open on the cache read (keep whatever was last known, or the
      // safe default if nothing was ever cached) rather than blocking every
      // email in the app because one settings read failed.
      if (cachedSettings === null) cachedSettings = DEFAULT_SETTINGS;
    }
  }
  return cachedSettings;
}

/** Master switch only — kept for callers that need the raw platform-wide flag rather than a specific channel. */
export async function isEmailCommunicationEnabled(): Promise<boolean> {
  const settings = await ensureSettingsCache();
  return settings.email_communication_enabled;
}

/** True only when BOTH the master switch and this channel's own flag are on — this is what sendEmail() actually gates on. */
export async function isEmailChannelEnabled(channel: EMAIL_CHANNEL): Promise<boolean> {
  const settings = await ensureSettingsCache();
  return settings.email_communication_enabled && !!settings[CHANNEL_FIELD[channel]];
}

export function invalidatePlatformSettingsCache(): void {
  cachedSettings = null;
  cacheLastRefreshed = 0;
}
