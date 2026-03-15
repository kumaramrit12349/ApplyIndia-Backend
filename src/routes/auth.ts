import { Router, Request, Response } from "express";
import {
  confirmSignUp,
  exchangeGoogleCode,
  forgotPassword,
  getOrCreateGoogleUser,
  resendConfirmationCode,
  resetPassword,
  signInUser,
  signUpUser,
  updateProfile,
  getUserProfile,
} from "../services/authService";
import { authenticateMe, getAdminRole } from "../middlewares/authMiddleware";
import { IErrorWithDetails, IResponse, ISignUpRes, RegisterRequest } from "../db_schema/Cognito/CongnitoInterface";
import { COGNITO_CONFIG } from "../config/env";

const router = Router();

router.get("/health", (_, res) => {
  res.json({ status: "Auth service running" });
});

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
    if (!email || !password) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Email and password are required",
        data: {},
      });
    }
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
    // Access token cookie (for API auth)
    res.cookie("accessToken", tokens.AccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 60 * 60 * 1000,
      path: "/",
    });
    // ID token cookie (for /auth/me profile info)
    if (tokens.IdToken) {
      res.cookie("idToken", tokens.IdToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 60 * 60 * 1000,
        path: "/",
      });
    }
    // Optional refresh token
    if (tokens.RefreshToken) {
      res.cookie("refreshToken", tokens.RefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }
    const resData: IResponse<{}> = {
      status: 200,
      success: true,
      message: "Login successful",
      data: {},
    };
    return res.status(200).json(resData);
  } catch (err: unknown) {
    const error = err as IErrorWithDetails;
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


router.get("/me", authenticateMe, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const adminRole = getAdminRole(user?.sub);
  return res.json({
    success: true,
    user: {
      isAdmin: !!adminRole,
      adminRole,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
    },
  });
});

router.get("/profile", authenticateMe, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const adminRole = getAdminRole(user?.sub);
  try {
    const fullProfile = await getUserProfile(user.sub);
    return res.json({
      success: true,
      user: {
        isAdmin: !!adminRole,
        adminRole,
        email: user.email,
        given_name: user.given_name,
        family_name: user.family_name,
        ...(fullProfile as object)
      },
    });
  } catch (error: any) {
    return res.status(error.code || 400).json({
      status: error.code || 400,
      success: false,
      message: error.message || "Failed to fetch profile",
      data: {},
    });
  }
});

router.put("/profile", authenticateMe, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const accessToken = req.cookies.accessToken;
  const data = req.body;
  try {
    await updateProfile(accessToken, user.sub, data);
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Profile updated successfully",
      data: {},
    });
  } catch (error: any) {
    return res.status(error.code || 400).json({
      status: error.code || 400,
      success: false,
      message: error.message || "Failed to update profile",
      data: {},
    });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("accessToken");
  res.clearCookie("idToken");
  res.clearCookie("refreshToken");
  res.json({ success: true, message: "Logged out" });
});

// POST /api/auth/confirm
router.post("/confirm", async (req: Request, res: Response) => {
  const { email, code } = req.body;
  try {
    await confirmSignUp(email, code);
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Account verified successfully. You can now log in.",
      data: {},
    });
  } catch (error: any) {
    let status = 400;
    let message = error.message || "Failed to verify account";
    if (error.name === "CodeMismatchException") {
      message = "Invalid verification code.";
    } else if (error.name === "ExpiredCodeException") {
      message = "Verification code expired. Please request a new one.";
    } else if (error.name === "UserNotFoundException") {
      status = 404;
      message = "User not found.";
    } else if (error.name === "NotAuthorizedException") {
      message = "User is already confirmed.";
    }
    return res.status(status).json({
      status,
      success: false,
      message,
      data: {},
    });
  }
});

// POST /api/auth/resend-code
router.post("/resend", async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    await resendConfirmationCode(email);
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Verification code sent to your email.",
      data: {},
    });
  } catch (error: any) {
    let status = 400;
    let message = error.message || "Failed to resend verification code";
    if (error.name === "UserNotFoundException") {
      status = 404;
      message = "User not found.";
    }
    return res.status(status).json({
      status,
      success: false,
      message,
      data: {},
    });
  }
});


// POST /api/auth/forgot-password
router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    await forgotPassword(email);
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Reset code sent to your email.",
      data: {},
    });
  } catch (error: any) {
    let status = 400;
    let message = error.message || "Failed to send reset code";
    if (error.name === "UserNotFoundException") {
      status = 404;
      message = "User not found.";
    }
    return res.status(status).json({
      status,
      success: false,
      message,
      data: {},
    });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body;
  try {
    await resetPassword(email, code, newPassword);
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Password reset successful. You can now log in.",
      data: {},
    });
  } catch (error: any) {
    let status = 400;
    let message = error.message || "Failed to reset password";
    if (error.name === "CodeMismatchException") {
      message = "Invalid verification code.";
    } else if (error.name === "ExpiredCodeException") {
      message = "Verification code expired.";
    } else if (error.name === "UserNotFoundException") {
      status = 404;
      message = "User not found.";
    }
    return res.status(status).json({
      status,
      success: false,
      message,
      data: {},
    });
  }
});


// ─── GOOGLE OAUTH ────────────────────────────────────────────────────────────

/**
 * GET /auth/google
 * Redirects the browser to the Cognito Hosted UI login page with Google as
 * the identity provider.
 */
router.get("/google", (_req: Request, res: Response) => {
  const { domain, clientId, googleCallbackUrl } = COGNITO_CONFIG;

  if (!domain || !clientId || !googleCallbackUrl) {
    return res.status(500).json({
      success: false,
      message: "Google sign-in is not configured. Please contact support.",
    });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: googleCallbackUrl,
    scope: "openid email profile",
    identity_provider: "Google",
  });

  return res.redirect(`${domain}/oauth2/authorize?${params.toString()}`);
});

/**
 * GET /auth/google/callback
 * Cognito redirects here after the user authenticates with Google.
 * 1. Exchange the authorization code for tokens.
 * 2. Ensure the user exists in DynamoDB (create if first time).
 * 3. Set the same httpOnly cookies as the email sign-in flow.
 * 4. Redirect to the frontend home page.
 */
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, error } = req.query as { code?: string; error?: string };
  const frontendUrl = (COGNITO_CONFIG.frontendUrl || "").replace(/\/+$/, "");

  if (error || !code) {
    console.error("Google OAuth callback error:", error);
    return res.redirect(
      `${frontendUrl}/auth/callback?auth_error=${encodeURIComponent(error || "google_auth_failed")}`
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeGoogleCode(code);

    // Ensure user exists in DynamoDB; create if first time
    await getOrCreateGoogleUser(tokens.id_token);

    const isProd = process.env.NODE_ENV === "production";

    // Set the same cookies as the email sign-in flow
    res.cookie("accessToken", tokens.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 60 * 60 * 1000,
      path: "/",
    });
    res.cookie("idToken", tokens.id_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 60 * 60 * 1000,
      path: "/",
    });
    if (tokens.refresh_token) {
      res.cookie("refreshToken", tokens.refresh_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }

    // Redirect to frontend — the /auth/callback page will pick up the session
    return res.redirect(`${frontendUrl}/auth/callback`);
  } catch (err: any) {
    console.error("Google OAuth callback failed:", err);
    const errorMessage = err.message || "google_auth_failed";
    return res.redirect(
      `${frontendUrl}/auth/callback?auth_error=${encodeURIComponent(errorMessage)}`
    );
  }
});

export default router;

