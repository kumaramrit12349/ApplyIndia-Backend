"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDynamoDB = updateDynamoDB;
const SharedConstant_1 = require("../../db_schema/shared/SharedConstant");
const updateData_1 = require("../../dynamoDB_CRUD/updateData");
const errorUtils_1 = require("../../utils/errorUtils");
async function updateDynamoDB(pk, sk, attributesToUpdate, objectForListAppend) {
    try {
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        const updateExpression = [];
        for (const [key, value] of Object.entries(attributesToUpdate)) {
            expressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + key] = key;
            updateExpression.push(SharedConstant_1.SPECIAL_CHARACTERS.HASH +
                key +
                SharedConstant_1.RELATIONAL_OPERATORS.EQUALS +
                SharedConstant_1.SPECIAL_CHARACTERS.COLON +
                key);
            expressionAttributeValues[SharedConstant_1.SPECIAL_CHARACTERS.COLON + key] = value;
        }
        const params = {
            Key: {
                pk: pk,
                sk: sk,
            },
            UpdateExpression: SharedConstant_1.DYNAMODB_KEYWORDS.set + " " + updateExpression.join(", "),
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: SharedConstant_1.RETURN_VALUES_MAPPER.UPDATED_NEW,
        };
        if (objectForListAppend) {
            params.ExpressionAttributeValues[":empty_list"] = [];
            Object.keys(objectForListAppend).forEach((key) => {
                params.UpdateExpression += `, ${SharedConstant_1.SPECIAL_CHARACTERS.HASH + key} = list_append(if_not_exists(${SharedConstant_1.SPECIAL_CHARACTERS.HASH + key}, :empty_list), :attrValue)`;
                params.ExpressionAttributeValues[":attrValue"] = [
                    objectForListAppend[key],
                ];
                params.ExpressionAttributeNames[SharedConstant_1.SPECIAL_CHARACTERS.HASH + key] = key;
            });
        }
        const result = await (0, updateData_1.updateItemDynamoDB)(params);
        return result;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("updateCalls.ts", "updateDynamoDB", error, "Error while updating dynamoDB", `learnerSK:`, { pk, sk, attributesToUpdate });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
