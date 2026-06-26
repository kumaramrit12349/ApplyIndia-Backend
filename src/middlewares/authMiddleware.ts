import jwt from "jsonwebtoken";
import jwksClient, { SigningKey } from "jwks-rsa";
import { COGNITO_CONFIG } from "../config/env";
import {
  AdminRole,
  IAdminPermissions,
} from "../db_schema/User/UserInterface";
import {
  getAllAdminUsers,
  getSuperAdminFallback,
  seedDefaultAdminRoles,
} from "../services/private/adminRoleService";

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

export type { AdminRole };

/**
 * Cached admin entry — role + granular permissions
 */
interface CachedAdminEntry {
  role: AdminRole;
  permissions: IAdminPermissions | null;
}

/** In-memory cache: sub → { role, permissions } */
let adminCache = new Map<string, CachedAdminEntry>();
let cacheLastRefreshed = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cacheInitialized = false;

/**
 * Refresh the admin roles cache from DynamoDB.
 * Queries all User# records that have admin_role set.
 */
export async function refreshAdminRolesCache(): Promise<void> {
  try {
    const adminUsers = await getAllAdminUsers();
    const newCache = new Map<string, CachedAdminEntry>();

    for (const user of adminUsers) {
      if (user.sub && user.admin_role) {
        newCache.set(user.sub, {
          role: user.admin_role,
          permissions: user.admin_permissions || null,
        });
      }
    }

    adminCache = newCache;
    cacheLastRefreshed = Date.now();
    cacheInitialized = true;
    console.log(
      `[AdminCache] Refreshed — ${adminCache.size} admin user(s) cached.`
    );
  } catch (err) {
    console.error("[AdminCache] Failed to refresh cache:", err);
    // Keep stale cache on failure rather than clearing it
  }
}

/**
 * Force an immediate cache refresh. Called after role mutations.
 */
export async function invalidateAdminCache(): Promise<void> {
  cacheLastRefreshed = 0; // Force stale
  await refreshAdminRolesCache();
}

/**
 * Ensure cache is populated. Auto-refreshes if stale.
 */
async function ensureCache(): Promise<void> {
  if (!cacheInitialized || Date.now() - cacheLastRefreshed > CACHE_TTL) {
    await refreshAdminRolesCache();
  }
}

/**
 * Initialize the admin system: seed defaults + populate cache.
 * Call once on server startup.
 */
export async function initAdminRoleSystem(): Promise<void> {
  console.log("[AdminRoleSystem] Initializing...");
  await seedDefaultAdminRoles();
  await refreshAdminRolesCache();
  console.log("[AdminRoleSystem] Ready.");
}

/* ======================== ROLE LOOKUPS ======================== */

const SUPER_ADMIN_FALLBACK = getSuperAdminFallback();

/** Returns the admin role for a given sub, or null if not an admin user. */
export const getAdminRole = (sub: string): AdminRole | null => {
  // Check in-memory cache first
  const cached = adminCache.get(sub);
  if (cached) return cached.role;

  // Fallback for super-admins (lock-out safety)
  return SUPER_ADMIN_FALLBACK[sub] ?? null;
};

/** Returns the admin permissions for a given sub, or null. */
export const getAdminPermissions = (
  sub: string
): IAdminPermissions | null => {
  const cached = adminCache.get(sub);
  if (cached) return cached.permissions;

  // Super-admin fallback = unrestricted
  if (SUPER_ADMIN_FALLBACK[sub]) {
    return {
      categories: ["all"],
      states: ["all"],
      data_window: "all",
    };
  }

  return null;
};

/** Legacy helper — checks if sub has any admin role */
export const isSubAllowed = (sub: string): boolean =>
  !!getAdminRole(sub);

/* ======================== PERMISSION HELPERS ======================== */

/**
 * Returns the Date cutoff for a data_window value.
 * Returns null if window is "all" (no restriction).
 */
export function getDataWindowCutoff(
  dataWindow: string | undefined
): number | null {
  if (!dataWindow || dataWindow === "all") return null;

  const now = Date.now();
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;

  switch (dataWindow) {
    case "last_1_month":
      return now - 1 * msPerMonth;
    case "last_2_months":
      return now - 2 * msPerMonth;
    case "last_3_months":
      return now - 3 * msPerMonth;
    case "last_6_months":
      return now - 6 * msPerMonth;
    case "last_1_year":
      return now - 12 * msPerMonth;
    default:
      return null;
  }
}

/**
 * Check if a permission scope allows a specific value.
 * ["all"] or empty array = unrestricted.
 */
function scopeAllows(allowedValues: string[], value: string): boolean {
  if (!allowedValues || allowedValues.length === 0) return true;
  if (allowedValues.includes("all")) return true;
  return allowedValues.includes(value);
}

/**
 * Check if a user's permissions allow operating on a notification
 * with the given category and state.
 */
export function permissionsAllowNotification(
  permissions: IAdminPermissions | null,
  notificationCategory?: string,
  notificationState?: string
): boolean {
  // No permissions object = unrestricted (super-admin fallback)
  if (!permissions) return true;

  // Check category
  if (notificationCategory && !scopeAllows(permissions.categories, notificationCategory)) {
    return false;
  }

  // Check state
  if (notificationState && !scopeAllows(permissions.states, notificationState)) {
    return false;
  }

  return true;
}

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
 * Attaches `req.adminRole` and `req.adminPermissions` for downstream route handlers.
 */
export const authenticateTokenAndEmail = async (
  req: any,
  res: any,
  next: any
) => {
  const accessToken = req?.cookies?.accessToken;
  if (!accessToken) {
    return res.status(401).json({ error: "Access denied" });
  }

  jwt.verify(
    accessToken,
    getKey,
    { algorithms: ["RS256"] },
    async (err: any, decoded: any) => {
      if (err) {
        console.error("JWT verify error (accessToken):", err);
        return res.status(403).json({ error: "Invalid token" });
      }

      // Ensure cache is fresh
      await ensureCache();

      const role = getAdminRole(decoded?.sub);
      if (!role) {
        return res
          .status(403)
          .json({ error: "You need Admin Access for it!" });
      }

      const permissions = getAdminPermissions(decoded?.sub);

      req.user = decoded;
      req.adminRole = role;
      req.adminPermissions = permissions;
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

/**
 * Permission guard middleware factory.
 * Checks if the user's scoped permissions allow operating on a notification
 * with the given category and state (extracted from request body or params).
 *
 * Usage: router.post("/add", requireRole("creator", "admin"), checkNotificationPermission(), handler)
 * Must be used AFTER authenticateTokenAndEmail.
 */
export const checkNotificationPermission = () => {
  return (req: any, res: any, next: any) => {
    const permissions: IAdminPermissions | null = req.adminPermissions;
    const role: AdminRole | undefined = req.adminRole;

    // Admin role = unrestricted
    if (role === "admin") return next();

    const category = req.body?.category;
    const state = req.body?.state;

    if (!permissionsAllowNotification(permissions, category, state)) {
      return res.status(403).json({
        error: "Access denied. You don't have permission for this category/state.",
      });
    }

    next();
  };
};
