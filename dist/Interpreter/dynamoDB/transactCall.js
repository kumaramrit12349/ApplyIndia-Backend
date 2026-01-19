"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertBulkDataDynamoDB = insertBulkDataDynamoDB;
const transactData_1 = require("../../dynamoDB_CRUD/transactData");
const errorUtils_1 = require("../../utils/errorUtils");
async function insertBulkDataDynamoDB(tableName, items) {
    try {
        return (0, transactData_1.insertItemsIntoDynamoDBInBulk)(tableName, items);
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("insertCalls.ts", "insertBulkDataDynamoDB", error, "Error while bulk insert into dynamoDB", "", { tableName, items });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
