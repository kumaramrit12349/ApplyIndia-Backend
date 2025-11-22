// src/routes/auth.ts
import { Router, Request, Response } from "express";
import { signInUser, signUpUser } from "../services/authService";
import {
  IResponse,
  ISignUpRes,
  RegisterRequest,
  IErrorWithDetails,
} from "../@types/auth";

const router = Router();

router.post("/signup", async (req: Request, res: Response) => {
  const data: RegisterRequest = req.body;

  try {
    const success = await signUpUser(data);

     const resData: IResponse<ISignUpRes> = {
      status: 200,
      message: 'Success',
      data: {  }, // boolean as expected
    };
    res.status(200).json(resData);
  } catch (err: unknown) {
    const error = err as IErrorWithDetails;
    const errData: IResponse<ISignUpRes> = {
      status: error.code || 400,
      message: error.message || "Registration failed",
      data: {
        failure: {
          email: error.details?.email || data.email,
        },
      },
    };
    res.status(errData.status).json(errData);
  }
});

router.post("/signin", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {

    const tokens = await signInUser(email, password);

    const resData: IResponse<{ tokens: any }> = {
      status: 200,
      message: 'Login successful',
      data: { tokens },
    };
    res.status(200).json(resData);
  } catch (err: unknown) {
    const error = err as IErrorWithDetails;
    const errData: IResponse<{}> = {
      status: error.code || 400,
      message: error.message || "Login failed",
      data: {},
    };
    res.status(errData.status).json(errData);
  }
});

export default router;
