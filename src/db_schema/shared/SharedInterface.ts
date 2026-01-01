import { GetCommandInput } from "@aws-sdk/lib-dynamodb/dist-types/commands/GetCommand";
import { BAD_REQUEST_NAME, TRY_AGAIN } from "./ErrorMessage";
import { StatusCodes } from "http-status-codes";

export interface IBatchGet {
  Keys: Record<string, any>[];
  AttributesToGet?: string[];
  ExpressionAttributeNames?: { [key: string]: string };
  ProjectionExpression?: GetCommandInput["ProjectionExpression"];
  ConsistentRead?: boolean;
}

export class ResponseError<T> extends Error {
  code: number;
  message: string;
  name: string;
  details: T | undefined;
  constructor(code?: number, name?: string, message = TRY_AGAIN, details?: T) {
    super();
    this.code = code ?? StatusCodes.BAD_REQUEST;
    this.name = name ?? BAD_REQUEST_NAME;
    this.message = message ?? TRY_AGAIN;
    this.details = details ?? ({} as T);
  }

  response?: {
    headers: { [key: string]: string };
    body: string;
  };
}

export interface IKeyValues {
  [key: string]: any;
}

export interface IFetchRelationalFields {
  [key: string]: any;
}