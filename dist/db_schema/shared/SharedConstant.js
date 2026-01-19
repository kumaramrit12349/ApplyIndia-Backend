"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETURN_VALUES_MAPPER = exports.RELATIONAL_OPERATORS = exports.DYNAMODB_KEYWORDS = exports.INSERT_ITEM_MAPPER = exports.TABLE_PK_MAPPER = exports.ALL_TABLE_NAMES = exports.REF_PROPERTIES = exports.SPECIAL_CHARACTERS = exports.KEY_ATTRIBUTES = exports.EXPRESSION_ATTRIBUTES_VALUES = exports.EXPRESSION_ATTRIBUTES_NAMES = exports.ARCHIVED = exports.NOTIFICATION_CATEGORIES = exports.ALL_TABLE_NAME = exports.TOATAL_COUNT = void 0;
exports.TOATAL_COUNT = "totalCount";
exports.ALL_TABLE_NAME = {
    Notification: "Notification",
};
exports.NOTIFICATION_CATEGORIES = {
    ALL: "all",
    JOB: "job",
    ADMIT_CARD: "admit-card",
    SYLLABUS: "syllabus",
    ANSWER_KEY: "answer-key",
    RESULT: "result",
    ENTRANCE_EXAM: "entrance-exam",
    ADMISSION: "admission",
    SCHOLARSHIP: "scholarship",
    SARKARI_YOJANA: "sarkari-yojana",
    DOCUMENTS: "documents",
};
exports.ARCHIVED = {
    is_archived: "is_archived",
    exprssionValue: ":is_archived",
    exprssionName: "#is_archived",
    filterExpression: " and (attribute_not_exists(#is_archived) or #is_archived=:is_archived)",
    projectExpression: ", #is_archived",
    whereClause: "(is_archived = 'false' OR is_archived IS NULL)"
};
exports.EXPRESSION_ATTRIBUTES_NAMES = {
    pk: "#pk",
    sk: "#sk",
};
exports.EXPRESSION_ATTRIBUTES_VALUES = {
    pk: ":pk",
    sk: ":sk",
};
exports.KEY_ATTRIBUTES = {
    pk: "pk",
    sk: "sk",
};
exports.SPECIAL_CHARACTERS = {
    HASH: "#",
    STAR: "*",
    COMMA: ",",
    COLON: ":",
    EQUALS_COLON: "=:",
    SLASH: "/",
    DOT: ".",
    UNDER_SCORE: "_",
};
exports.REF_PROPERTIES = {
    relation_id: "relation_id",
    assigned_cohort: "assigned_cohort",
    cohort_p1: "cohort_p1",
    cohort_p2: "cohort_p2",
    status: "status",
    apply_date: "apply_date",
    reflection_form: "reflection_form",
    tracking_question_answer: "tracking_question_answer",
    report_360: "report_360",
};
exports.ALL_TABLE_NAMES = {
    Notification: "Notification",
    Feedback: "Feedback",
};
exports.TABLE_PK_MAPPER = {
    Notification: "Notification#",
    Feedback: "Feedback#",
};
exports.INSERT_ITEM_MAPPER = {
    pk: "pk",
    sk: "sk",
    created_at: "created_at",
    modified_at: "modified_at",
};
exports.DYNAMODB_KEYWORDS = {
    key: "Key",
    set: "set",
    remove: "remove",
    contains: "contains",
    not_contains: "not contains",
    keyword: "keyword",
    UpdateExpression: "UpdateExpression",
    ExpressionAttributeNames: "ExpressionAttributeNames",
    ExpressionAttributeValues: "ExpressionAttributeValues",
    ReturnValues: "ReturnValues",
};
exports.RELATIONAL_OPERATORS = {
    EQUALS: "=",
    GREATER_THAN: ">",
    LESS_THAN: "<",
    GREATER_THAN_EQUALS_TO: ">=",
};
exports.RETURN_VALUES_MAPPER = {
    NONE: "NONE",
    ALL_OLD: "ALL_OLD",
    UPDATED_OLD: "UPDATED_OLD",
    ALL_NEW: "ALL_NEW",
    UPDATED_NEW: "UPDATED_NEW",
};
