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

/* ======================== ROLE SYSTEM ======================== */

export type AdminRole = "creator" | "reviewer" | "admin";

/**
 * Map of Cognito `sub` → admin role.
 * Add user subs here to grant admin dashboard access.
 */
const ADMIN_ROLES: Record<string, AdminRole> = {
  "71e3ed0a-50e1-703a-f403-b96b7377db22": "admin",
  "41134dfa-8081-7054-8696-98f8c6c26461": "admin",
  "b1b3edba-5001-709c-b72b-aea0af85985c": "creator",
  "61935d6a-d0c1-70b4-e501-7d72a9f6bd06": "reviewer",
};

/** Returns the admin role for a given sub, or null if not an admin user. */
export const getAdminRole = (sub: string): AdminRole | null =>
  ADMIN_ROLES[sub] ?? null;

/** Legacy helper — checks if sub has any admin role */
export const isSubAllowed = (sub: string): boolean =>
  !!ADMIN_ROLES[sub];

/* ======================== MIDDLEWARE ======================== */

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

/**
 * Authenticate access token AND verify the user has an admin role.
 * Attaches `req.adminRole` for downstream route handlers.
 */
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
      const role = getAdminRole(decoded?.sub);
      if (!role) {
        return res.status(403).json({ error: "You need Admin Access for it!" });
      }
      req.user = decoded;
      req.adminRole = role;
      next();
    },
  );
};

/**
 * Role guard middleware factory.
 * Usage: router.post("/add", requireRole("creator", "admin"), handler)
 * Must be used AFTER authenticateTokenAndEmail.
 */
export const requireRole = (...allowedRoles: AdminRole[]) => {
  return (req: any, res: any, next: any) => {
    const role: AdminRole | undefined = req.adminRole;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
      });
    }
    next();
  };
};
