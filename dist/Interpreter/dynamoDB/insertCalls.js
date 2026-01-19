"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertDataDynamoDB = insertDataDynamoDB;
const insertData_1 = require("../../dynamoDB_CRUD/insertData");
const errorUtils_1 = require("../../utils/errorUtils");
async function insertDataDynamoDB(tableName, Item) {
    try {
        return (0, insertData_1.insertItemIntoDynamoDB)(tableName, Item);
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("insertCalls.ts", "insertItemIntoDynamoDB", error, "Error while insert item into dynamoDB", `learnerSK:`, { tableName, Item });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
