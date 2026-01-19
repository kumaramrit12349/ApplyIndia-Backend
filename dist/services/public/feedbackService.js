"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addFeedbackToDB = addFeedbackToDB;
const ulid_1 = require("ulid");
const SharedConstant_1 = require("../../db_schema/shared/SharedConstant");
const insertCalls_1 = require("../../Interpreter/dynamoDB/insertCalls");
const errorUtils_1 = require("../../utils/errorUtils");
async function addFeedbackToDB(feedback) {
    try {
        console.log('feedback', feedback);
        const item = {
            pk: SharedConstant_1.TABLE_PK_MAPPER.Feedback,
            sk: SharedConstant_1.TABLE_PK_MAPPER.Feedback + (0, ulid_1.ulid)(),
            name: feedback.name,
            email: feedback.email,
            message: feedback.message,
        };
        await (0, insertCalls_1.insertDataDynamoDB)(SharedConstant_1.ALL_TABLE_NAMES.Feedback, // or same table if single-table design
        item);
        return true;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("feedbackService.ts", "addFeedbackToDB", error, "Error while saving feedback", "", feedback);
        throw error;
    }
}
