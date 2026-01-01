export const TOATAL_COUNT = "totalCount";

export const ALL_TABLE_NAME = {
  NOTIFICATION: "notifications",
};

export const NOTIFICATION_CATEGORIES = {
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
}

export const ARCHIVED = {
  is_archived: "is_archived",
  exprssionValue: ":is_archived",
  exprssionName: "#is_archived",
  filterExpression:
    " and (attribute_not_exists(#is_archived) or #is_archived=:is_archived)",
  projectExpression: ", #is_archived",
  whereClause: "(is_archived = 'false' OR is_archived IS NULL)"
};

export const TABLE_PK_MAPPER = {
  Notification: "Notification#",
};

export const EXPRESSION_ATTRIBUTES_NAMES = {
  pk: "#pk",
  sk: "#sk",
};

export const EXPRESSION_ATTRIBUTES_VALUES = {
  pk: ":pk",
  sk: ":sk",
};

export const KEY_ATTRIBUTES = {
  pk: "pk",
  sk: "sk",
};

export const SPECIAL_CHARACTERS = {
  HASH: "#",
  STAR: "*",
  COMMA: ",",
  COLON: ":",
  EQUALS_COLON: "=:",
  SLASH: "/",
  DOT: ".",
  UNDER_SCORE: "_",
};


export const REF_PROPERTIES = {
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

export const ALL_TABLE_NAMES = {
  Opportunity: "Opportunity",
  Sponsor: "Sponsor",
  Cohort: "Cohort",
  Skill: "Skill",
  Eligibility: "Eligibility",
  Badge: "Badge",
  Reward: "Reward",
  Learner: "Learner",
  Panellist: "Panellist",
  CareerAddOn: "CareerAddOn",
  CompetitionAddOn: "CompetitionAddOn",
  CompetitionUser: "CompetitionUser",
  Organization: "Organization",
  Collaboration: "Collaboration",
  ScholarshipTransaction: "ScholarshipTransaction",
  BandColorCode: "BandColorCode",
  Testimonial: "Testimonial",
  FAQ: "FAQ",
  Notification: "Notification",
  Degree: "Degree",
  Major: "Major",
  WorkItem: "WorkItem",
  WorkItemArchive: "WorkItemArchive",
  ApproverList: "ApproverList",
  EmailTemplate: "EmailTemplate",
  BadgrTransaction: "BadgrTransaction",
  ChangeCohortTransaction: "ChangeCohortTransaction",
  DropoutTransaction: "DropoutTransaction",
  Role: "Role",
  Permission: "Permission",
  Form: "Form",
  AllTableNames: "AllTableNames",
  NotStartedTransaction: "NotStartedTransaction",
  ExperienceGps: "ExperienceGps",
  ExperienceGpsBadge: "ExperienceGpsBadge",
  AddCohortTransaction: "AddCohortTransaction",
  CohortAllocationTransaction: "CohortAllocationTransaction",
  ExperienceGpsBadgrTransaction: "ExperienceGpsBadgrTransaction",
  Wish: "Wish",
  Payment: "Payment",
  ReasonAccRej: "ReasonAccRej",
  Pe: "Pe"
};

export const INSERT_ITEM_MAPPER = {
  pk: "pk",
  sk: "sk",
  created_at: "created_at",
  modified_at: "modified_at",
};

export const DYNAMODB_KEYWORDS = {
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

export const RELATIONAL_OPERATORS = {
  EQUALS: "=",
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_THAN_EQUALS_TO: ">=",
};

export const RETURN_VALUES_MAPPER = {
  NONE: "NONE",
  ALL_OLD: "ALL_OLD",
  UPDATED_OLD: "UPDATED_OLD",
  ALL_NEW: "ALL_NEW",
  UPDATED_NEW: "UPDATED_NEW",
};