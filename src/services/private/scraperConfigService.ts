import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { IScraperConfig } from "../../db_schema/ScraperConfig/ScraperConfigInterface";
import { SCRAPER_CONFIG, SCRAPER_CONFIG_TYPE_MAPPER } from "../../db_schema/ScraperConfig/ScraperConfigConstant";

/**
 * Fetch all active or inactive scraper configs
 */
export async function getAllScraperConfigs(includeInactive = true, includeArchived = false): Promise<IScraperConfig[]> {
  const configs = await fetchDynamoDB<IScraperConfig>(
    ALL_TABLE_NAMES.Site,
    undefined,
    ["*"],
    {
      [SCRAPER_CONFIG.type]: SCRAPER_CONFIG_TYPE_MAPPER.META.substring(1),
    },
    "#type = :type",
    { skipValue: 0, itemsPerPage: 0, relationalTable: null },
    includeArchived
  );

  // If includeArchived is true, it might return both active and archived.
  // If false, it only returns active.
  let results = configs;
  if (!includeArchived) {
    results = configs.filter(c => !c.is_archived);
  } else {
    // If we ONLY want archived, we could filter here, but normally "include" means both.
    // For the dashboard archive view, we usually want ONLY archived.
    // Let's make it "onlyArchived" if needed, but for now simple include is fine.
  }

  if (includeInactive) {
    return results;
  }

  return results.filter(c => c.isActive);
}

/**
 * Fetch a specific config
 */
export async function getScraperConfig(key: string): Promise<IScraperConfig | null> {
  const configs = await fetchDynamoDB<IScraperConfig>(
    ALL_TABLE_NAMES.Site,
    `Site#${key}`,
    ["*"]
  );
  if (configs && configs.length > 0 && !configs[0].is_archived) {
    return configs[0];
  }
  return null;
}

/**
 * Helper to generate a slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars (except spaces and hyphens)
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with a single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Create a new scraper config
 */
export async function createScraperConfig(
  data: Omit<IScraperConfig, "pk" | "sk" | "type" | "created_at" | "modified_at" | "key"> & { key?: string }
): Promise<boolean> {
  // ── Sanitization ──
  const cleanName = data.name.trim();
  const cleanKey = (data.key || generateSlug(cleanName)).trim().toLowerCase();
  const cleanUrl = data.listingUrl.trim().replace(/\/$/, "");

  // ── Duplicate Check ──
  // We check the sort key directly to see if this site key is already taken
  const existingRecords = await fetchDynamoDB<IScraperConfig>(
    ALL_TABLE_NAMES.Site,
    `Site#${cleanKey}`,
    ["sk"]
  );

  if (existingRecords && existingRecords.length > 0) {
    throw new Error(`Conflict: A source with key '${cleanKey}' already exists.`);
  }

  const now = Date.now();
  const dbItem: IScraperConfig = {
    ...data,
    key: cleanKey,
    name: cleanName,
    listingUrl: cleanUrl,
    pk: TABLE_PK_MAPPER.Site,
    sk: `Site#${cleanKey}`,
    type: SCRAPER_CONFIG_TYPE_MAPPER.META.substring(1),
    created_at: now,
    modified_at: now,
  };

  await insertDataDynamoDB(ALL_TABLE_NAMES.Site, dbItem);
  return true;
}

/**
 * Update an existing scraper config
 */
export async function updateScraperConfig(
  key: string,
  updates: Partial<Omit<IScraperConfig, "pk" | "sk" | "type" | "created_at">>
): Promise<boolean> {
  if (Object.keys(updates).length === 0) return true;

  // STRIP KEYS: Ensure we don't try to update the Partition Key (pk) or Sort Key (sk)
  // as DynamoDB UpdateExpressions do not allow modifying these attributes.
  const { pk, sk, type, created_at, modified_at, ...attributesToUpdate } = updates as any;

  if (Object.keys(attributesToUpdate).length === 0) return true;

  await updateDynamoDB(
    TABLE_PK_MAPPER.Site,
    `Site#${key}`,
    attributesToUpdate
  );

  return true;
}

export async function archiveScraperConfig(key: string): Promise<boolean> {
  await updateScraperConfig(key, { is_archived: true });
  return true;
}

/**
 * Permanently delete a scraper config
 */
export async function deleteScraperConfig(key: string): Promise<boolean> {
  await deleteDynamoDB(
    TABLE_PK_MAPPER.Site,
    `Site#${key}`
  );
  return true;
}

/**
 * Unarchive a scraper config (Restoration)
 */
export async function unarchiveScraperConfig(key: string): Promise<boolean> {
  await updateScraperConfig(key, { is_archived: false });
  return true;
}

/**
 * Bulk delete multiple scraper configs
 */
export async function bulkDeleteScraperConfigs(keys: string[]): Promise<boolean> {
  if (!keys || keys.length === 0) return true;
  await Promise.all(keys.map(key => deleteScraperConfig(key)));
  return true;
}
