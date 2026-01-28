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
    },
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
    },
  );
};

const ALLOWED_SUB = ["91539dea-c071-70a1-f14c-e99807a1d727"];

const isSubAllowed = (sub: string): boolean => {
  if (!sub) return false;
  return ALLOWED_SUB.includes(sub);
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
      if (!isSubAllowed(decoded?.sub)) {
        return res.status(403).json({ error: "You need Admin Access for it!" });
      }
      req.user = decoded;
      next();
    },
  );
};
