"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDynamoDB = fetchDynamoDB;
exports.fetchDynamoDBWithLimit = fetchDynamoDBWithLimit;
exports.getRelationalData = getRelationalData;
const fetchData_1 = require("../../dynamoDB_CRUD/fetchData");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const SharedConstant_1 = require("../../db_schema/shared/SharedConstant");
const ErrorMessage_1 = require("../../db_schema/shared/ErrorMessage");
const NotificationConstant_1 = require("../../db_schema/Notification/NotificationConstant");
const errorUtils_1 = require("../../utils/errorUtils");
const env_1 = require("../../config/env");
async function fetchDynamoDB(tableName, sk, attributesToGet, queryFilter, filterString, objectForSlicingRelationalData = {
    skipValue: 0,
    itemsPerPage: 0,
    relationalTable: null,
}, includeArchived = true, skBeginsWith) {
    try {
        if (!SharedConstant_1.TABLE_PK_MAPPER[tableName]) {
            throw new Error(ErrorMessage_1.TABLE_NAME_NOT_FOUND);
        }
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        const projectionExpression = [];
        const tempAttributesToGet = [];
        let relationalTables = [];
        let relationalAttributesToGet = [];
        const { skipValue, itemsPerPage, relationalTable } = objectForSlicingRelationalData;
        if (attributesToGet && attributesToGet[0] != "*") {
            if (!attributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.pk)) {
                expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk] =
                    SharedConstant_1.KEY_ATTRIBUTES.pk;
                projectionExpression.push(SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk);
            }
            if (!attributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.sk)) {
                expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk] =
                    SharedConstant_1.KEY_ATTRIBUTES.sk;
                projectionExpression.push(SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk);
            }
            attributesToGet?.forEach((item) => {
                if (item.charAt(0) == item.charAt(0).toUpperCase()) {
                    if (item.split("/")[0] &&
                        !relationalTables.includes(item.split("/")[0])) {
                        relationalTables.push(item.split("/")[0]);
                        expressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + item.split("/")[0]] = item.split("/")[0];
                        projectionExpression.push(SharedConstant_1.SPECIAL_CHARACTERS.HASH + item.split("/")[0]);
                    }
                    if (item.split("/")[1] == "*") {
                        if (item.split("/")[0] &&
                            !relationalAttributesToGet.includes(item.split("/")[0])) {
                            relationalAttributesToGet.push(...RELATIONAL_TABLES_PROPERTIES[item.split("/")[0]]);
                        }
                    }
                    else {
                        if (item.split("/")[1] &&
                            !relationalAttributesToGet.includes(item.split("/")[1])) {
                            relationalAttributesToGet.push(item.split("/")[1]);
                        }
                    }
                }
                else {
                    expressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + item] = item;
                    projectionExpression.push(SharedConstant_1.SPECIAL_CHARACTERS.HASH + item);
                }
            });
        }
        else if (attributesToGet) {
            attributesToGet.shift();
            tempAttributesToGet.push(...attributesToGet);
            attributesToGet.forEach((item) => {
                if (item.charAt(0) == item.charAt(0).toUpperCase()) {
                    if (!relationalTables.includes(item.split("/")[0])) {
                        relationalTables.push(item.split("/")[0]);
                    }
                    if (item.split("/")[1] == "*") {
                        if (!relationalAttributesToGet.includes(item.split("/")[0])) {
                            relationalAttributesToGet.push(...RELATIONAL_TABLES_PROPERTIES[item.split("/")[0]]);
                        }
                    }
                    else {
                        if (item.split("/")[0] &&
                            !relationalAttributesToGet.includes(item.split("/")[0])) {
                            relationalAttributesToGet.push(item.split("/")[1]);
                        }
                    }
                }
                else {
                    expressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + item] = item;
                    projectionExpression.push(SharedConstant_1.SPECIAL_CHARACTERS.HASH + item);
                }
            });
        }
        //remove undefined attributes
        relationalTables = relationalTables?.filter((ele) => ele);
        //remove undefined attributes
        relationalAttributesToGet = relationalAttributesToGet?.filter((ele) => ele);
        //remove duplicates
        relationalTables = relationalTables?.filter((item, index) => relationalTables?.indexOf(item) === index);
        //remove duplicates
        relationalAttributesToGet = relationalAttributesToGet?.filter((item, index) => relationalAttributesToGet?.indexOf(item) === index);
        if (!relationalAttributesToGet?.includes(SharedConstant_1.KEY_ATTRIBUTES.pk)) {
            relationalAttributesToGet.push(SharedConstant_1.KEY_ATTRIBUTES.pk);
        }
        if (!relationalAttributesToGet?.includes(SharedConstant_1.KEY_ATTRIBUTES.sk)) {
            relationalAttributesToGet.push(SharedConstant_1.KEY_ATTRIBUTES.sk);
        }
        if (queryFilter) {
            for (const [key, value] of Object.entries(queryFilter)) {
                if (key.includes(".")) {
                    expressionAttributeValues[SharedConstant_1.SPECIAL_CHARACTERS.COLON + key.replace(".", "_")] = value;
                }
                else if (!expressionAttributeNames[key] != null &&
                    !key.includes(".")) {
                    expressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + key] = key;
                    expressionAttributeValues[SharedConstant_1.SPECIAL_CHARACTERS.COLON + key] = value;
                }
            }
            for (const [key, value] of Object.entries(expressionAttributeNames)) {
                if (!filterString.includes(key) &&
                    !projectionExpression.includes(key)) {
                    delete expressionAttributeNames[key];
                }
            }
            //deleting unused expressionValues
            for (const [key, value] of Object.entries(expressionAttributeValues)) {
                if (!filterString.includes(key)) {
                    delete expressionAttributeValues[key];
                }
            }
        }
        if (sk) {
            if (!projectionExpression.includes(SharedConstant_1.ARCHIVED.exprssionName) &&
                projectionExpression.length > 0) {
                projectionExpression.push(SharedConstant_1.ARCHIVED.exprssionName);
                expressionAttributeNames[SharedConstant_1.ARCHIVED.exprssionName] = SharedConstant_1.ARCHIVED.is_archived;
            }
            const params = {
                TableName: env_1.DYNAMODB_CONFIG.TABLE_NAME,
                Key: (0, util_dynamodb_1.marshall)({
                    pk: SharedConstant_1.TABLE_PK_MAPPER[tableName],
                    sk: sk,
                }),
                ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0
                    ? expressionAttributeNames
                    : undefined,
                ProjectionExpression: projectionExpression.length > 0
                    ? projectionExpression.join(SharedConstant_1.SPECIAL_CHARACTERS.COMMA)
                    : undefined,
            };
            const result = await (0, fetchData_1.getItemFromDynamoDB)(params);
            if (!result) {
                return [];
            }
            if ((skipValue > 0 || itemsPerPage > 0) &&
                relationalTable != null &&
                SharedConstant_1.ALL_TABLE_NAMES[relationalTable] &&
                result[relationalTable]) {
                if (Array.isArray(result[relationalTable])) {
                    result[SharedConstant_1.TOATAL_COUNT] = result[relationalTable]?.length;
                    result[relationalTable] = result[relationalTable].slice(skipValue, itemsPerPage + skipValue);
                }
                else if (typeof result[relationalTable] === "object") {
                    result[SharedConstant_1.TOATAL_COUNT] = 1;
                }
            }
            // fetching the relational data attributes
            const dataWithRelations = await getRelationalData([result], relationalTables, relationalAttributesToGet);
            return dataWithRelations;
        }
        else {
            // pk is always required for Query
            expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk] =
                SharedConstant_1.KEY_ATTRIBUTES.pk;
            expressionAttributeValues[SharedConstant_1.EXPRESSION_ATTRIBUTES_VALUES.pk] =
                SharedConstant_1.TABLE_PK_MAPPER[tableName];
            // Base KeyConditionExpression
            let keyConditionExpression = SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk +
                SharedConstant_1.SPECIAL_CHARACTERS.EQUALS_COLON +
                SharedConstant_1.KEY_ATTRIBUTES.pk;
            // ⭐ ADD begins_with(sk, skBeginsWith) SUPPORT
            if (skBeginsWith) {
                expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk] =
                    SharedConstant_1.KEY_ATTRIBUTES.sk;
                expressionAttributeValues[SharedConstant_1.EXPRESSION_ATTRIBUTES_VALUES.sk] =
                    skBeginsWith;
                keyConditionExpression +=
                    " AND begins_with(" +
                        SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk +
                        ", " +
                        SharedConstant_1.EXPRESSION_ATTRIBUTES_VALUES.sk +
                        ")";
            }
            const params = {
                TableName: env_1.DYNAMODB_CONFIG.TABLE_NAME,
                KeyConditionExpression: keyConditionExpression,
                FilterExpression: filterString && filterString.length > 0 ? filterString : undefined,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ProjectionExpression: projectionExpression.length > 0
                    ? projectionExpression.join(SharedConstant_1.SPECIAL_CHARACTERS.COMMA)
                    : undefined,
            };
            const result = await (0, fetchData_1.queryItemsFromDynamoDB)(params, includeArchived);
            if (!result) {
                return [];
            }
            const dataWithRelations = await getRelationalData(result, relationalTables, relationalAttributesToGet);
            return dataWithRelations;
        }
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("fetchCalls.ts", "fetchDynamoDB", error, "Error while fetching dynamodb data", "", {
            tableName,
            sk,
            attributesToGet,
            queryFilter,
            filterString,
        });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
        return []; // TS safety
    }
}
async function fetchDynamoDBWithLimit(tableName, limit, startKey, attributesToGet, queryFilter, filterString) {
    try {
        const pkValue = SharedConstant_1.TABLE_PK_MAPPER[tableName];
        if (!pkValue) {
            throw new Error(ErrorMessage_1.TABLE_NAME_NOT_FOUND);
        }
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        const projectionExpression = [];
        let relationalTables = [];
        let relationalAttributesToGet = [];
        /* ------------------------------------
         * 1. Projection handling
         * ------------------------------------ */
        if (attributesToGet && attributesToGet[0] !== "*") {
            if (!attributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.pk)) {
                expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk] =
                    SharedConstant_1.KEY_ATTRIBUTES.pk;
                projectionExpression.push(SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk);
            }
            if (!attributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.sk)) {
                expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk] =
                    SharedConstant_1.KEY_ATTRIBUTES.sk;
                projectionExpression.push(SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk);
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
                        const relationalTable = table;
                        relationalAttributesToGet.push(...RELATIONAL_TABLES_PROPERTIES[relationalTable]);
                    }
                    else if (attr) {
                        relationalAttributesToGet.push(attr);
                    }
                }
                else {
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
        if (!relationalAttributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.pk)) {
            relationalAttributesToGet.push(SharedConstant_1.KEY_ATTRIBUTES.pk);
        }
        if (!relationalAttributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.sk)) {
            relationalAttributesToGet.push(SharedConstant_1.KEY_ATTRIBUTES.sk);
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
        expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk] =
            SharedConstant_1.KEY_ATTRIBUTES.pk;
        expressionAttributeValues[SharedConstant_1.EXPRESSION_ATTRIBUTES_VALUES.pk] = pkValue;
        const params = {
            TableName: env_1.DYNAMODB_CONFIG.TABLE_NAME,
            KeyConditionExpression: `${SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk} = ${SharedConstant_1.EXPRESSION_ATTRIBUTES_VALUES.pk}`,
            FilterExpression: filterString || undefined,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ProjectionExpression: projectionExpression.length > 0
                ? projectionExpression.join(",")
                : undefined,
        };
        /* ------------------------------------
         * 5. Query with pagination
         * ------------------------------------ */
        const result = await (0, fetchData_1.queryItemsWithLimitDynamoDB)(params, limit, startKey);
        const dataWithRelations = await getRelationalData(result.results, relationalTables, relationalAttributesToGet);
        return {
            results: dataWithRelations,
            lastEvaluatedKey: result.lastEvaluatedKey,
        };
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("fetchCalls.ts", "fetchDynamoDBWithLimit", error, "Error while fetching dynamodb data with limit", "", {
            tableName,
            limit,
            startKey,
            attributesToGet,
            queryFilter,
            filterString,
        });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
        return { results: [] }; // TS safety
    }
}
async function getRelationalData(result, relationalTables, relationalAttributesToGet) {
    if (!relationalTables?.length ||
        !relationalAttributesToGet?.length ||
        relationalAttributesToGet.length <= 2) {
        return result;
    }
    const relationalKeys = [];
    const uniqueSK = new Set();
    /* ---------------------------------------------
       1. COLLECT RELATIONAL KEYS
    --------------------------------------------- */
    for (const item of result) {
        const record = item;
        for (const table of relationalTables) {
            if (!SharedConstant_1.ALL_TABLE_NAMES[table] || record[table] == null)
                continue;
            const tableValue = record[table];
            if (Array.isArray(tableValue)) {
                for (const relationalField of tableValue) {
                    const sk = relationalField?.sk?.toString();
                    if (sk && !uniqueSK.has(sk)) {
                        uniqueSK.add(sk);
                        relationalKeys.push({
                            pk: sk.split("#")[0] + SharedConstant_1.SPECIAL_CHARACTERS.HASH,
                            sk,
                        });
                    }
                }
            }
            else if (typeof tableValue === "object") {
                const sk = tableValue?.sk?.toString();
                if (sk && !uniqueSK.has(sk)) {
                    uniqueSK.add(sk);
                    relationalKeys.push({
                        pk: sk.split("#")[0] + SharedConstant_1.SPECIAL_CHARACTERS.HASH,
                        sk,
                    });
                }
            }
        }
    }
    if (!relationalKeys.length)
        return result;
    /* ---------------------------------------------
       2. BUILD PROJECTION
    --------------------------------------------- */
    const expressionAttributeNames = {};
    const projectionExpression = [];
    relationalAttributesToGet = Array.from(new Set(relationalAttributesToGet)).filter(Boolean);
    if (!relationalAttributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.pk)) {
        expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk] =
            SharedConstant_1.KEY_ATTRIBUTES.pk;
        projectionExpression.push(SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.pk);
    }
    if (!relationalAttributesToGet.includes(SharedConstant_1.KEY_ATTRIBUTES.sk)) {
        expressionAttributeNames[SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk] =
            SharedConstant_1.KEY_ATTRIBUTES.sk;
        projectionExpression.push(SharedConstant_1.EXPRESSION_ATTRIBUTES_NAMES.sk);
    }
    for (const attr of relationalAttributesToGet) {
        expressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + attr] = attr;
        projectionExpression.push(SharedConstant_1.SPECIAL_CHARACTERS.HASH + attr);
    }
    /* ---------------------------------------------
       3. BATCH GET RELATIONAL DATA
    --------------------------------------------- */
    const batchGetParams = {
        Keys: relationalKeys,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0
            ? expressionAttributeNames
            : undefined,
        ProjectionExpression: projectionExpression.join(SharedConstant_1.SPECIAL_CHARACTERS.COMMA),
    };
    const relationalData = await (0, fetchData_1.batchGetItemsFromDynamoDB)(batchGetParams);
    const relationalMap = new Map();
    for (const item of relationalData) {
        relationalMap.set(item[SharedConstant_1.KEY_ATTRIBUTES.sk], item);
    }
    /* ---------------------------------------------
       4. MERGE RELATIONAL DATA BACK
    --------------------------------------------- */
    return result.map((item) => {
        const record = item;
        for (const table of relationalTables) {
            if (!SharedConstant_1.ALL_TABLE_NAMES[table] || record[table] == null)
                continue;
            const tableValue = record[table];
            if (Array.isArray(tableValue)) {
                record[table] = tableValue.map((relationalField) => {
                    const mapped = relationalMap.get(relationalField?.sk);
                    return mapped ? { ...mapped, ...relationalField } : relationalField;
                });
            }
            else if (typeof tableValue === "object") {
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
    Notification: Object.keys(NotificationConstant_1.NOTIFICATION),
};
