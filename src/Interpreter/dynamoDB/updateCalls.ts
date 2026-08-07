import { DYNAMODB_KEYWORDS, RELATIONAL_OPERATORS, RETURN_VALUES_MAPPER, SPECIAL_CHARACTERS } from "../../db_schema/shared/SharedConstant";
import { IKeyValues } from "../../db_schema/shared/SharedInterface";
import { updateItemDynamoDB } from "../../dynamoDB_CRUD/updateData";
import { handleErrorsAxios, logErrorLocation } from "../../utils/errorUtils";
import { ChannelStatus, IChannelResult } from "../../db_schema/Notification/DistributionInterface";

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

type DistributionChannel = "email";

/**
 * Flips a distribution channel's status from "pending" to a final value once
 * its counters have caught up to total_count. Called after both counter
 * increments and the total_count write, since either can be the "last" event
 * to complete depending on how fast sends finish relative to enumeration —
 * whichever one observes processedCount >= total_count first does the flip.
 * The ConditionExpression makes a redundant flip from a concurrent caller a
 * no-op rather than an error.
 */
async function maybeFinalizeDistributionChannel(
  pk: string,
  sk: string,
  channel: DistributionChannel,
  channelResult: IChannelResult
): Promise<IChannelResult> {
  const totalCount = channelResult.total_count;
  const processedCount =
    (channelResult.sent_count || 0) +
    (channelResult.failed_count || 0) +
    (channelResult.skipped_count || 0);

  if (totalCount === undefined || processedCount < totalCount) {
    return channelResult;
  }

  const finalStatus: ChannelStatus =
    (channelResult.sent_count || 0) > 0
      ? "sent"
      : (channelResult.failed_count || 0) > 0
      ? "failed"
      : "skipped";

  try {
    await updateItemDynamoDB({
      Key: { pk, sk },
      UpdateExpression: "set #channel.#status = :final",
      ConditionExpression: "#channel.#status = :pending",
      ExpressionAttributeNames: { "#channel": channel, "#status": "status" },
      ExpressionAttributeValues: { ":final": finalStatus, ":pending": "pending" },
    });
    return { ...channelResult, status: finalStatus };
  } catch (error: any) {
    // Another concurrent caller already flipped it first — benign race, not an error.
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    return channelResult;
  }
}

/**
 * Atomically increments sent/failed/skipped counters on a notification's
 * #DISTRIBUTION item for one channel. Safe to call concurrently from many
 * parallel sender Lambda invocations — DynamoDB's ADD is a real atomic
 * counter, unlike the read-modify-write updateDynamoDB() does for flat SETs.
 */
export async function incrementDistributionChannelCounters(
  pk: string,
  sk: string,
  channel: DistributionChannel,
  delta: { sent: number; failed: number; skipped: number }
): Promise<IChannelResult | undefined> {
  try {
    const updated = await updateItemDynamoDB({
      Key: { pk, sk },
      UpdateExpression:
        "ADD #channel.#sent :s, #channel.#failed :f, #channel.#skipped :k",
      ExpressionAttributeNames: {
        "#channel": channel,
        "#sent": "sent_count",
        "#failed": "failed_count",
        "#skipped": "skipped_count",
      },
      ExpressionAttributeValues: { ":s": delta.sent, ":f": delta.failed, ":k": delta.skipped },
      ReturnValues: RETURN_VALUES_MAPPER.ALL_NEW,
    });
    const channelResult: IChannelResult | undefined = updated?.[channel];
    if (!channelResult) return channelResult;
    return await maybeFinalizeDistributionChannel(pk, sk, channel, channelResult);
  } catch (error) {
    logErrorLocation(
      "updateCalls.ts",
      "incrementDistributionChannelCounters",
      error,
      "Error while incrementing distribution channel counters",
      "",
      { pk, sk, channel, delta }
    );
    handleErrorsAxios(error, {});
  }
}

/**
 * Sets the eligible-user total a channel's counters are converging toward.
 * Uses a nested-path SET (not the flat updateDynamoDB) so it never clobbers
 * sent_count/failed_count/skipped_count that concurrent sender Lambdas may
 * already be incrementing while enumeration is still in progress.
 */
export async function setDistributionTotalCount(
  pk: string,
  sk: string,
  channel: DistributionChannel,
  total: number
): Promise<void> {
  try {
    const updated = await updateItemDynamoDB({
      Key: { pk, sk },
      UpdateExpression: "set #channel.#total = :total",
      ExpressionAttributeNames: { "#channel": channel, "#total": "total_count" },
      ExpressionAttributeValues: { ":total": total },
      ReturnValues: RETURN_VALUES_MAPPER.ALL_NEW,
    });
    const channelResult: IChannelResult | undefined = updated?.[channel];
    if (channelResult) await maybeFinalizeDistributionChannel(pk, sk, channel, channelResult);
  } catch (error) {
    logErrorLocation(
      "updateCalls.ts",
      "setDistributionTotalCount",
      error,
      "Error while setting distribution total count",
      "",
      { pk, sk, channel, total }
    );
    handleErrorsAxios(error, {});
  }
}
