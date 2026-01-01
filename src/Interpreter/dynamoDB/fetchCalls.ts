import {
  batchGetItemsFromDynamoDB,
  getItemFromDynamoDB,
  queryItemsFromDynamoDB,
  queryItemsWithLimitDynamoDB,
} from "../../dynamoDB_CRUD/fetchData";
import {
  GetItemCommandInput,
  QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { IBatchGet, IFetchRelationalFields, IKeyValues } from "../../db_schema/shared/SharedInterface";
import {
  ALL_TABLE_NAMES,
  EXPRESSION_ATTRIBUTES_NAMES,
  EXPRESSION_ATTRIBUTES_VALUES,
  KEY_ATTRIBUTES,
  SPECIAL_CHARACTERS,
  TABLE_PK_MAPPER,
  TOATAL_COUNT,
} from "../../db_schema/shared/SharedConstant";
import { TABLE_NAME_NOT_FOUND } from "../../db_schema/shared/ErrorMessage";
import { NOTIFICATION } from "../../db_schema/Notification/NotificationConstant";
import { handleErrorsAxios, logErrorLocation } from "../../utils/errorUtils";
import { DYNAMODB_CONFIG } from "../../config/env";

export async function fetchDynamoDB<T>(
  tableName: string,
  sk?: string,
  attributesToGet?: string[],
  queryFilter?: IKeyValues,
  filterString?: string,
  isMaterTable = false,
  objectForSlicingRelationalData = {
    skipValue: 0,
    itemsPerPage: 0,
    relationalTable: null as string | null,
  }
): Promise<T[]> {
  try {
    if (!TABLE_PK_MAPPER[tableName]) {
      throw new Error(TABLE_NAME_NOT_FOUND);
    }

    const TABLE_NAME = isMaterTable
      ? process.env.MASTER_TABLE_NAME
      : process.env.MODERATOR_TABLE_NAME;

    if (!TABLE_NAME) {
      throw new Error("DynamoDB table name not defined");
    }

    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: IKeyValues = {};
    const projectionExpression: string[] = [];

    let relationalTables: string[] = [];
    let relationalAttributesToGet: string[] = [];

    const { skipValue, itemsPerPage, relationalTable } =
      objectForSlicingRelationalData;

    /* ---------------- Projection handling ---------------- */

    const attrs = attributesToGet ? [...attributesToGet] : [];

    if (attrs.length && attrs[0] !== "*") {
      if (!attrs.includes(KEY_ATTRIBUTES.pk)) {
        expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.pk] =
          KEY_ATTRIBUTES.pk;
        projectionExpression.push(EXPRESSION_ATTRIBUTES_NAMES.pk);
      }

      if (!attrs.includes(KEY_ATTRIBUTES.sk)) {
        expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.sk] =
          KEY_ATTRIBUTES.sk;
        projectionExpression.push(EXPRESSION_ATTRIBUTES_NAMES.sk);
      }
    }

    /* ---------------- Filters ---------------- */

    if (queryFilter) {
      for (const [key, value] of Object.entries(queryFilter)) {
        const safeKey = key.replace(".", "_");

        expressionAttributeNames[`#${safeKey}`] = key;
        expressionAttributeValues[`:${safeKey}`] = value;
      }

      if (filterString) {
        for (const key of Object.keys(expressionAttributeNames)) {
          if (
            !filterString.includes(key) &&
            !projectionExpression.includes(key)
          ) {
            delete expressionAttributeNames[key];
          }
        }

        for (const key of Object.keys(expressionAttributeValues)) {
          if (!filterString.includes(key)) {
            delete expressionAttributeValues[key];
          }
        }
      }
    }

    /* ---------------- GET by SK ---------------- */

    if (sk) {
      const params: GetItemCommandInput = {
        TableName: TABLE_NAME,
        Key: marshall({
          pk: TABLE_PK_MAPPER[tableName],
          sk,
        }),
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length
          ? expressionAttributeNames
          : undefined,
        ProjectionExpression: projectionExpression.length
          ? projectionExpression.join(",")
          : undefined,
      };

      const result = await getItemFromDynamoDB(params);
      if (!result) return [];

      if (
        relationalTable &&
        result[relationalTable] &&
        (skipValue > 0 || itemsPerPage > 0)
      ) {
        if (Array.isArray(result[relationalTable])) {
          result[TOATAL_COUNT] = result[relationalTable].length;
          result[relationalTable] = result[relationalTable].slice(
            skipValue,
            skipValue + itemsPerPage
          );
        }
      }

      return await getRelationalData<T>(
        [result as T],
        relationalTables,
        relationalAttributesToGet,
      );
    }

    /* ---------------- QUERY ---------------- */

    expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.pk] =
      KEY_ATTRIBUTES.pk;
    expressionAttributeValues[EXPRESSION_ATTRIBUTES_VALUES.pk] =
      TABLE_PK_MAPPER[tableName];

    const queryParams: QueryCommandInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: `${EXPRESSION_ATTRIBUTES_NAMES.pk} = ${EXPRESSION_ATTRIBUTES_VALUES.pk}`,
      FilterExpression: filterString || undefined,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ProjectionExpression: projectionExpression.length
        ? projectionExpression.join(",")
        : undefined,
    };

    const result = await queryItemsFromDynamoDB<T>(queryParams);

    return await getRelationalData<T>(
      result,
      relationalTables,
      relationalAttributesToGet,
    );
  } catch (error) {
    logErrorLocation(
      "fetchCalls.ts",
      "fetchDynamoDB",
      error,
      "Error while fetching dynamodb data",
      "",
      {
        tableName,
        sk,
        attributesToGet,
        queryFilter,
        filterString,
        isMaterTable,
      }
    );

    handleErrorsAxios(error, {});
    return []; // TS safety
  }
}

export async function fetchDynamoDBWithLimit<T extends Record<string, any>>(
  tableName: string,
  limit: number,
  startKey?: Record<string, any>,
  attributesToGet?: string[],
  queryFilter?: IKeyValues,
  filterString?: string,
): Promise<{ results: T[]; lastEvaluatedKey?: Record<string, any> }> {
  try {
    const pkValue = TABLE_PK_MAPPER[tableName];
    if (!pkValue) {
      throw new Error(TABLE_NAME_NOT_FOUND);
    }

    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: IKeyValues = {};
    const projectionExpression: string[] = [];

    let relationalTables: string[] = [];
    let relationalAttributesToGet: string[] = [];

    /* ------------------------------------
     * 1. Projection handling
     * ------------------------------------ */
    if (attributesToGet && attributesToGet[0] !== "*") {
      if (!attributesToGet.includes(KEY_ATTRIBUTES.pk)) {
        expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.pk] =
          KEY_ATTRIBUTES.pk;
        projectionExpression.push(EXPRESSION_ATTRIBUTES_NAMES.pk);
      }

      if (!attributesToGet.includes(KEY_ATTRIBUTES.sk)) {
        expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.sk] =
          KEY_ATTRIBUTES.sk;
        projectionExpression.push(EXPRESSION_ATTRIBUTES_NAMES.sk);
      }

      for (const item of attributesToGet) {
        if (item[0] === item[0].toUpperCase()) {
          const [table, attr] = item.split("/");

          if (table && !relationalTables.includes(table)) {
            relationalTables.push(table);
            expressionAttributeNames[`#${table}`] = table;
            projectionExpression.push(`#${table}`);
          }

          if (attr === "*") {
            const relationalTable =
              table as keyof typeof RELATIONAL_TABLES_PROPERTIES;
            relationalAttributesToGet.push(
              ...RELATIONAL_TABLES_PROPERTIES[relationalTable]
            );
          } else if (attr) {
            relationalAttributesToGet.push(attr);
          }
        } else {
          expressionAttributeNames[`#${item}`] = item;
          projectionExpression.push(`#${item}`);
        }
      }
    }

    /* ------------------------------------
     * 2. De-dup & safety
     * ------------------------------------ */
    relationalTables = [...new Set(relationalTables.filter(Boolean))];
    relationalAttributesToGet = [
      ...new Set(relationalAttributesToGet.filter(Boolean)),
    ];

    if (!relationalAttributesToGet.includes(KEY_ATTRIBUTES.pk)) {
      relationalAttributesToGet.push(KEY_ATTRIBUTES.pk);
    }
    if (!relationalAttributesToGet.includes(KEY_ATTRIBUTES.sk)) {
      relationalAttributesToGet.push(KEY_ATTRIBUTES.sk);
    }

    /* ------------------------------------
     * 3. Filters
     * ------------------------------------ */
    if (queryFilter && filterString) {
      for (const [key, value] of Object.entries(queryFilter)) {
        const safeKey = key.includes(".") ? key.replace(".", "_") : key;

        expressionAttributeNames[`#${safeKey}`] = key;
        expressionAttributeValues[`:${safeKey}`] = value;
      }
    }

    /* ------------------------------------
     * 4. PK condition
     * ------------------------------------ */
    expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.pk] =
      KEY_ATTRIBUTES.pk;
    expressionAttributeValues[EXPRESSION_ATTRIBUTES_VALUES.pk] = pkValue;

    const params: QueryCommandInput = {
      TableName: DYNAMODB_CONFIG.TABLE_NAME,
      KeyConditionExpression: `${EXPRESSION_ATTRIBUTES_NAMES.pk} = ${EXPRESSION_ATTRIBUTES_VALUES.pk}`,
      FilterExpression: filterString || undefined,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ProjectionExpression:
        projectionExpression.length > 0
          ? projectionExpression.join(",")
          : undefined,
    };

    /* ------------------------------------
     * 5. Query with pagination
     * ------------------------------------ */
    const result = await queryItemsWithLimitDynamoDB<T>(
      params,
      limit,
      startKey
    );

    const dataWithRelations = await getRelationalData<T>(
      result.results,
      relationalTables,
      relationalAttributesToGet,
    );

    return {
      results: dataWithRelations,
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  } catch (error) {
    logErrorLocation(
      "fetchCalls.ts",
      "fetchDynamoDBWithLimit",
      error,
      "Error while fetching dynamodb data with limit",
      "",
      {
        tableName,
        limit,
        startKey,
        attributesToGet,
        queryFilter,
        filterString,
      }
    );

    handleErrorsAxios(error, {});
    return { results: [] }; // TS safety
  }
}

export async function getRelationalData<T extends Record<string, any>>(
  result: T[],
  relationalTables: string[],
  relationalAttributesToGet: string[],
): Promise<T[]> {
  if (
    !relationalTables?.length ||
    !relationalAttributesToGet?.length ||
    relationalAttributesToGet.length <= 2
  ) {
    return result;
  }
  const relationalKeys: Record<string, any>[] = [];
  const uniqueSK = new Set<string>();
  /* ---------------------------------------------
     1. COLLECT RELATIONAL KEYS
  --------------------------------------------- */
  for (const item of result) {
    const record = item as Record<string, any>;
    for (const table of relationalTables) {
      if (!ALL_TABLE_NAMES[table] || record[table] == null) continue;
      const tableValue = record[table];
      if (Array.isArray(tableValue)) {
        for (const relationalField of tableValue as IFetchRelationalFields[]) {
          const sk = relationalField?.sk?.toString();
          if (sk && !uniqueSK.has(sk)) {
            uniqueSK.add(sk);
            relationalKeys.push({
              pk: sk.split("#")[0] + SPECIAL_CHARACTERS.HASH,
              sk,
            });
          }
        }
      } else if (typeof tableValue === "object") {
        const sk = tableValue?.sk?.toString();
        if (sk && !uniqueSK.has(sk)) {
          uniqueSK.add(sk);
          relationalKeys.push({
            pk: sk.split("#")[0] + SPECIAL_CHARACTERS.HASH,
            sk,
          });
        }
      }
    }
  }
  if (!relationalKeys.length) return result;
  /* ---------------------------------------------
     2. BUILD PROJECTION
  --------------------------------------------- */
  const expressionAttributeNames: Record<string, string> = {};
  const projectionExpression: string[] = [];
  relationalAttributesToGet = Array.from(new Set(relationalAttributesToGet)).filter(Boolean);
  if (!relationalAttributesToGet.includes(KEY_ATTRIBUTES.pk)) {
    expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.pk] = KEY_ATTRIBUTES.pk;
    projectionExpression.push(EXPRESSION_ATTRIBUTES_NAMES.pk);
  }
  if (!relationalAttributesToGet.includes(KEY_ATTRIBUTES.sk)) {
    expressionAttributeNames[EXPRESSION_ATTRIBUTES_NAMES.sk] = KEY_ATTRIBUTES.sk;
    projectionExpression.push(EXPRESSION_ATTRIBUTES_NAMES.sk);
  }
  for (const attr of relationalAttributesToGet) {
    expressionAttributeNames[SPECIAL_CHARACTERS.HASH + attr] = attr;
    projectionExpression.push(SPECIAL_CHARACTERS.HASH + attr);
  }
  /* ---------------------------------------------
     3. BATCH GET RELATIONAL DATA
  --------------------------------------------- */
  const batchGetParams: IBatchGet = {
    Keys: relationalKeys,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames
        : undefined,
    ProjectionExpression: projectionExpression.join(SPECIAL_CHARACTERS.COMMA),
  };
  const relationalData = await batchGetItemsFromDynamoDB(
    batchGetParams,
  );
  const relationalMap = new Map<string, Record<string, any>>();
  for (const item of relationalData) {
    relationalMap.set(item[KEY_ATTRIBUTES.sk], item);
  }
  /* ---------------------------------------------
     4. MERGE RELATIONAL DATA BACK
  --------------------------------------------- */
  return result.map((item) => {
    const record = item as Record<string, any>;
    for (const table of relationalTables) {
      if (!ALL_TABLE_NAMES[table] || record[table] == null) continue;
      const tableValue = record[table];
      if (Array.isArray(tableValue)) {
        record[table] = tableValue.map((relationalField) => {
          const mapped = relationalMap.get(relationalField?.sk);
          return mapped ? { ...mapped, ...relationalField } : relationalField;
        });
      } else if (typeof tableValue === "object") {
        const mapped = relationalMap.get(tableValue?.sk);
        if (mapped) {
          record[table] = { ...mapped, ...tableValue };
        }
      }
    }
    return item;
  });
}

const RELATIONAL_TABLES_PROPERTIES = {
  Notification: Object.keys(NOTIFICATION),
};

export type RelationalTableName = keyof typeof RELATIONAL_TABLES_PROPERTIES;
