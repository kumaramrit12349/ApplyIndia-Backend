import { Router, Request, Response } from "express";
import { signInUser, signUpUser } from "../services/authService";
import {
  IResponse,
  ISignUpRes,
  RegisterRequest,
  IErrorWithDetails,
} from "../@types/auth";
import { authenticateToken } from "../middlewares/authMiddleware";

const router = Router();

router.post("/signup", async (req: Request, res: Response) => {
  const data: RegisterRequest = req.body;
  try {
    const success = await signUpUser(data);
    const resData: IResponse<ISignUpRes> = {
      status: 200,
      success: true,
      message: "Success",
      data: {}, // boolean as expected
    };
    res.status(200).json(resData);
  } catch (err: unknown) {
    const error = err as IErrorWithDetails;
    const errData: IResponse<ISignUpRes> = {
      status: error.code || 400,
      success: true,
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
    // 1) Basic validation
    if (!email || !password) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Email and password are required",
        data: {},
      });
    }
    // 2) Authenticate with Cognito
    const tokens = await signInUser(email, password);
    if (!tokens || !tokens.AccessToken) {
      return res.status(401).json({
        status: 401,
        success: false,
        message: "Login failed",
        data: {},
      });
    }
    const isProd = process.env.NODE_ENV === "production";
    // 3) HttpOnly cookie for access token (used by /auth/me middleware)
    res.cookie("accessToken", tokens.AccessToken, {
      httpOnly: true,
      secure: isProd, // HTTPS only in prod
      sameSite: isProd ? "none" : "lax", // important for localhost:5173 ↔ 4000
      maxAge: 60 * 60 * 1000, // 1 hour
      path: "/",
    });
    // 4) Optional refresh token cookie for silent refresh later
    if (tokens.RefreshToken) {
      res.cookie("refreshToken", tokens.RefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });
    }
    // 5) Minimal response – no tokens, just a success flag/message
    const resData: IResponse<{}> = {
      status: 200,
      success: true,
      message: "Login successful",
      data: {},
    };
    return res.status(200).json(resData);
  } catch (err: unknown) {
    const error = err as IErrorWithDetails;
    // 6) Map common Cognito errors to friendly responses
    let status = 400;
    let message = error.message || "Login failed";

    if (error.name === "NotAuthorizedException") {
      status = 401;
      message = "Invalid email or password";
    } else if (error.name === "UserNotConfirmedException") {
      status = 403;
      message = "User is not confirmed. Please verify your email.";
    } else if (error.name === "UserNotFoundException") {
      status = 404;
      message = "User does not exist";
    }
    const errData: IResponse<{}> = {
      status,
      success: false,
      message,
      data: {},
    };
    return res.status(status).json(errData);
  }
});

router.get("/me", authenticateToken, (req: Request, res: Response) => {
  res.json({
    success: true,
    user: (req as any).user,
  });
});

router.post("/signout", (req: Request, res: Response) => {
  res.clearCookie("accessToken");
  res.clearCookie("idToken");
  res.clearCookie("refreshToken");
  res.json({ success: true, message: "Logged out" });
});

export default router;
