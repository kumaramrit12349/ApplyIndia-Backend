import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { logErrorLocation } from "../../utils/errorUtils";


export interface IFeedbackInput {
  name: string;
  email: string;
  message: string;
}

export async function addFeedbackToDB(
  feedback: IFeedbackInput
): Promise<boolean> {
  try {
    const item = {
      pk: TABLE_PK_MAPPER.Feedback,
      sk: TABLE_PK_MAPPER.Feedback + ulid(),
      name: feedback.name,
      email: feedback.email,
      message: feedback.message,
    };
    await insertDataDynamoDB(
      ALL_TABLE_NAMES.Feedback,
      item
    );
    return true;
  } catch (error) {
    logErrorLocation(
      "feedbackService.ts",
      "addFeedbackToDB",
      error,
      "Error while saving feedback",
      "",
      feedback
    );
    throw error;
  }
}
