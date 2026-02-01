export interface RegisterRequest {
  email: string;
  password: string;
  given_name: string;
  family_name: string;
  gender: string;
}

export interface IResponse<T> {
  status: number;
  success: boolean;
  message: string;
  data: T;
}

export interface ISignUpRes {
  success?: boolean;
  failure?: {
    email?: string;
  };
}

export interface IErrorWithDetails extends Error {
  code?: number;
  name: string;
  details?: { email?: string };
}

