import jwt from "jsonwebtoken";
import jwksClient, { SigningKey } from "jwks-rsa";
import { COGNITO_CONFIG } from "../config/env";

const client = jwksClient({
  jwksUri: `https://cognito-idp.${COGNITO_CONFIG.region}.amazonaws.com/${COGNITO_CONFIG.userPoolId}/.well-known/jwks.json`,
});

async function getKey(header: any, callback: any) {
  try {
    const key: SigningKey = await client.getSigningKey(header.kid);
    const signingKey = key.getPublicKey(); // <-- use this
    callback(null, signingKey);
  } catch (err) {
    callback(err, undefined);
  }
}

// For protecting APIs with the access token
export const authenticateToken = (req: any, res: any, next: any) => {
  const accessToken = req?.cookies?.accessToken;
  if (!accessToken) {
    return res.status(401).json({ error: "Access denied" });
  }
  jwt.verify(
    accessToken,
    getKey,
    { algorithms: ["RS256"] },
    (err: any, decoded: any) => {
      if (err) {
        console.error("JWT verify error (accessToken):", err);
        return res.status(403).json({ error: "Invalid token" });
      }
      req.user = decoded;
      next();
    }
  );
};

// authMiddleware.ts (same file)
export const authenticateMe = (req: any, res: any, next: any) => {
  const idToken = req?.cookies?.idToken;
  if (!idToken) {
    return res.status(401).json({ error: "Access denied" });
  }

  jwt.verify(
    idToken,
    getKey,
    { algorithms: ["RS256"] },
    (err: any, decoded: any) => {
      if (err) {
        console.error("JWT verify error (idToken /me):", err);
        return res.status(403).json({ error: "Invalid token" });
      }
      req.user = decoded;
      next();
    }
  );
};

const ALLOWED_EMAILS = [
 "support@applyindia.online",

];

const isEmailAllowed = (
  email: string | string[] | undefined
): boolean => {
  if (!email) return false;

  if (Array.isArray(email)) {
    return email.some(e => ALLOWED_EMAILS.includes(e));
  }

  return ALLOWED_EMAILS.includes(email);
};

export const authenticateTokenAndEmail = (req: any, res: any, next: any) => {
  const accessToken = req?.cookies?.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: "Access denied" });
  }

  jwt.verify(
    accessToken,
    getKey,
    { algorithms: ["RS256"] },
    (err: any, decoded: any) => {
      if (err) {
        console.error("JWT verify error (accessToken):", err);
        return res.status(403).json({ error: "Invalid token" });
      }

      // 🔐 EMAIL AUTHORIZATION (string | string[])
      if (!isEmailAllowed(decoded?.email)) {
        return res.status(403).json({ error: "You need Admin Access for it!" });
      }

      req.user = decoded;
      next();
    }
  );
};

