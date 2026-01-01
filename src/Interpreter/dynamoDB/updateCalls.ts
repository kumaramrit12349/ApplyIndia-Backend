import { DYNAMODB_KEYWORDS, RELATIONAL_OPERATORS, RETURN_VALUES_MAPPER, SPECIAL_CHARACTERS } from "../../db_schema/shared/SharedConstant";
import { IKeyValues } from "../../db_schema/shared/SharedInterface";
import { updateItemDynamoDB } from "../../dynamoDB_CRUD/updateData";
import { handleErrorsAxios, logErrorLocation } from "../../utils/errorUtils";

export async function updateDynamoDB(
  pk: string,
  sk: string,
  attributesToUpdate: IKeyValues,
  objectForListAppend?: IKeyValues
): Promise<Record<string, any>> {
  try {
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: IKeyValues = {};
    const updateExpression = [];
    for (const [key, value] of Object.entries(attributesToUpdate)) {
      expressionAttributeNames[SPECIAL_CHARACTERS.HASH + key] = key;
      updateExpression.push(
        SPECIAL_CHARACTERS.HASH +
          key +
          RELATIONAL_OPERATORS.EQUALS +
          SPECIAL_CHARACTERS.COLON +
          key
      );
      expressionAttributeValues[SPECIAL_CHARACTERS.COLON + key] = value;
    }
    const params = {
      Key: {
        pk: pk,
        sk: sk,
      },
      UpdateExpression:
        DYNAMODB_KEYWORDS.set + " " + updateExpression.join(", "),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: RETURN_VALUES_MAPPER.UPDATED_NEW,
    };
    if (objectForListAppend) {
      params.ExpressionAttributeValues[":empty_list"] = [];
      Object.keys(objectForListAppend).forEach((key) => {
        params.UpdateExpression += `, ${
          SPECIAL_CHARACTERS.HASH + key
        } = list_append(if_not_exists(${
          SPECIAL_CHARACTERS.HASH + key
        }, :empty_list), :attrValue)`;
        params.ExpressionAttributeValues[":attrValue"] = [
          objectForListAppend[key],
        ];
        params.ExpressionAttributeNames[SPECIAL_CHARACTERS.HASH + key] = key;
      });
    }
    const result = await updateItemDynamoDB(params);
    return result;
  } catch (error) {
    logErrorLocation(
      "updateCalls.ts",
      "updateDynamoDB",
      error,
      "Error while updating dynamoDB",
      `learnerSK:`,
      { pk, sk, attributesToUpdate }
    );
    handleErrorsAxios(error, {});
  }
}
