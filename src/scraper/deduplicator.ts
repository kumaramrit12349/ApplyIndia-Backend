import { queryItemsFromDynamoDB } from "../dynamoDB_CRUD/fetchData";
import { TABLE_PK_MAPPER } from "../db_schema/shared/SharedConstant";
import { DYNAMODB_CONFIG } from "../config/env";

// Singleton RAM cache for URLs and Titles
let urlCache: Set<string> | null = null;
let titleCache: Set<string> | null = null;

/**
 * Normalizes a title for robust deduplication.
 * Strips special chars, whitespace, and case.
 */
export function normalizeTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // remove all non-alphanumeric
    .trim();
}

/**
 * Bootstraps the deduplication cycle by downloading every single existing scraped URL
 * and Title from the database into RAM.
 */
export async function initializeDeduplicatorCache(): Promise<void> {
  const params = {
    TableName: DYNAMODB_CONFIG.TABLE_NAME,
    KeyConditionExpression: "#pk = :pk",
    FilterExpression: "#type = :type",
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#type": "type",
      "#source_url": "source_url",
      "#title": "title",
    },
    ExpressionAttributeValues: {
      ":pk": TABLE_PK_MAPPER.Notification,
      ":type": "META",
    },
    ProjectionExpression: "#source_url, #title",
  };

  try {
    const results = await queryItemsFromDynamoDB<any>(params as any, true);
    urlCache = new Set();
    titleCache = new Set();
    
    for (const r of results) {
      if (r.source_url) urlCache.add(r.source_url);
      if (r.title) titleCache.add(normalizeTitle(r.title));
    }
    console.log(`[Deduplicator] Initialized memory cache with ${urlCache.size} URLs and ${titleCache.size} Titles.`);
  } catch (err) {
    console.error(`[Deduplicator] Critical cache error:`, err);
    urlCache = new Set();
    titleCache = new Set();
  }
}

/**
 * Instantly checks against the RAM cache if the URL OR Title has already been imported.
 */
export async function isDuplicate(sourceUrl: string, title?: string): Promise<boolean> {
  if (!sourceUrl && !title) return false;
  
  if (urlCache === null || titleCache === null) {
     await initializeDeduplicatorCache();
  }

  // URL match is a hard duplicate
  if (sourceUrl && urlCache!.has(sourceUrl)) return true;

  // Title match (normalized) is a soft duplicate
  if (title) {
    const norm = normalizeTitle(title);
    if (titleCache!.has(norm)) return true;
  }

  return false;
}

/**
 * Notifies the cache that a new notification was safely injected into the DB this session
 */
export function addDuplicationRecord(sourceUrl: string, title?: string) {
  if (urlCache && sourceUrl) urlCache.add(sourceUrl);
  if (titleCache && title) titleCache.add(normalizeTitle(title));
}
