import { AxiosError } from "axios";
import { IErrorWithDetails } from "../@types/auth";
import { BAD_REQUEST, BAD_REQUEST_NAME, INTERNAL_SERVER_ERROR, SERVER_ERROR, TRY_AGAIN } from "../db_schema/shared/ErrorMessage";
import { ResponseError } from "../db_schema/shared/SharedInterface";

// src/utils/errorUtils.ts


export const createThrowError = <T>(
  code: number,
  name: string,
  msg: string,
  details: T
): ResponseError<T> => {
  const err = new ResponseError();
  err.code = code ?? BAD_REQUEST;
  err.name = name ?? BAD_REQUEST_NAME;
  err.message = msg ?? TRY_AGAIN;
  err.details = details ?? {};
  throw err;
};

export function logErrorLocation(
  fileName: string,
  method: string,
  error: any,
  message: string,
  learnerSK: string,
  params: any
) {
  const logErrorObject = {
    date: new Date().toISOString().slice(0, 20),
    Time: new Date().getTime(),
    fileName,
    method,
    error,
    message,
    learnerSK,
    errrCode: error.code,
    trace:error.stack,
    url: params?.req?.originalUrl,
    ip: params?.req?.ip,
    params: JSON.stringify({
      body: params?.req?.body,
      headers: params?.req?.headers,
      params: params?.req?.params,
      other: params?.req ? {} : params, // for other parameters
    }),
  };
  console.log(logErrorObject);
}


export const handleErrorsAxios = <T>(
  error: AxiosError | ResponseError<any>,
  details: T
) => {
  error = error as AxiosError;
  if (error?.response || error?.request) {
    createThrowError(INTERNAL_SERVER_ERROR, SERVER_ERROR, TRY_AGAIN, details);
  } else {
    // Something happened in setting up the request that triggered an Error
    const errCode = isNaN(Number(error.code))
      ? BAD_REQUEST
      : Number(error.code);
    createThrowError(errCode, error.name, error.message, details);
  }
};