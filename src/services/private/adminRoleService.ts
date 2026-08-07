import { AdminRole, IAdminPermissions, IUser } from "../../db_schema/User/UserInterface";
import { TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { queryItemsFromDynamoDB } from "../../dynamoDB_CRUD/fetchData";
import { updateItemDynamoDB } from "../../dynamoDB_CRUD/updateData";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { logErrorLocation } from "../../utils/errorUtils";
import { DYNAMODB_CONFIG } from "../../config/env";
import { QueryCommandInput } from "@aws-sdk/client-dynamodb";

/* ================================================================
   HARDCODED SUPER-ADMIN FALLBACK (lock-out safety net)

   Keyed by EMAIL, not Cognito `sub`. A `sub` is permanently tied to one
   specific Cognito user record — if that account is ever deleted (e.g.
   during testing) and a new account is created with the same email,
   Cognito issues a brand-new `sub`, which would silently break a
   sub-keyed fallback. Keying by email survives that: whichever account
   currently owns this email is treated as a super-admin.
   ================================================================ */
const SUPER_ADMIN_EMAILS: Record<string, AdminRole> = {
  "support@applyindia.online": "admin",
};

/* ================================================================
   1. GET ALL ADMIN USERS
   Queries User# records that have admin_role set
   ================================================================ */
export async function getAllAdminUsers(): Promise<IUser[]> {
  try {
    const pk = TABLE_PK_MAPPER.User;

    const params: QueryCommandInput = {
      TableName: DYNAMODB_CONFIG.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      FilterExpression: "attribute_exists(#admin_role)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#admin_role": "admin_role",
      },
      ExpressionAttributeValues: {
        ":pk": pk as any,
      },
    };

    const results = await queryItemsFromDynamoDB<IUser>(params);
    return results;
  } catch (error) {
    logErrorLocation(
      "adminRoleService.ts",
      "getAllAdminUsers",
      error,
      "Error fetching admin users",
      "",
      {}
    );
    return [];
  }
}

/* ================================================================
   2. ASSIGN ROLE
   Updates admin_role + admin_permissions on an existing User record.
   ================================================================ */
export async function assignRole(
  sub: string,
  role: AdminRole,
  permissions: IAdminPermissions,
  assignedBySub: string
): Promise<void> {
  const pk = TABLE_PK_MAPPER.User;
  const sk = `${pk}${sub}`;

  const fullPermissions: IAdminPermissions = {
    ...permissions,
    assigned_by: assignedBySub,
    assigned_at: Date.now(),
  };

  const updateItemParam = {
    Key: { pk, sk },
    UpdateExpression:
      "set #admin_role = :admin_role, #admin_permissions = :admin_permissions",
    ExpressionAttributeNames: {
      "#admin_role": "admin_role",
      "#admin_permissions": "admin_permissions",
    },
    ExpressionAttributeValues: {
      ":admin_role": role,
      ":admin_permissions": fullPermissions,
    },
  };

  await updateItemDynamoDB(updateItemParam);
}

/* ================================================================
   3. REMOVE ROLE
   Removes admin_role + admin_permissions from a User record.
   Cannot remove super-admin fallback users (checked by their current
   email, since the fallback itself is keyed by email — see above).
   ================================================================ */
export async function removeRole(sub: string): Promise<void> {
  const email = await getUserEmailBySub(sub);
  if (email && SUPER_ADMIN_EMAILS[email]) {
    throw new Error("Cannot remove super-admin role. This user is a system-level admin.");
  }

  const pk = TABLE_PK_MAPPER.User;
  const sk = `${pk}${sub}`;

  const updateItemParam = {
    Key: { pk, sk },
    UpdateExpression: "remove #admin_role, #admin_permissions",
    ExpressionAttributeNames: {
      "#admin_role": "admin_role",
      "#admin_permissions": "admin_permissions",
    },
    ExpressionAttributeValues: {},
  };

  await updateItemDynamoDB(updateItemParam);
}

/* ================================================================
   4. LOOKUP USER BY EMAIL
   Scans User# records to find a user by email.
   ================================================================ */
export async function lookupUserByEmail(
  email: string
): Promise<IUser | null> {
  try {
    const pk = TABLE_PK_MAPPER.User;

    const params: QueryCommandInput = {
      TableName: DYNAMODB_CONFIG.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":pk": pk as any,
        ":email": email.toLowerCase() as any,
      },
    };

    const results = await queryItemsFromDynamoDB<IUser>(params);
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logErrorLocation(
      "adminRoleService.ts",
      "lookupUserByEmail",
      error,
      "Error looking up user by email",
      "",
      { email }
    );
    return null;
  }
}

/* ================================================================
   5. SEED DEFAULT ADMIN ROLES
   One-time migration: writes admin_role + permissions onto whichever
   User record currently owns each hardcoded super-admin email.
   Idempotent — skips if that user already has a role, or if no user
   with that email exists yet (e.g. hasn't signed up).
   ================================================================ */
export async function seedDefaultAdminRoles(): Promise<void> {
  const defaults = Object.entries(SUPER_ADMIN_EMAILS).map(([email, role]) => ({
    email,
    role,
  }));

  for (const { email, role } of defaults) {
    try {
      const user = await lookupUserByEmail(email);

      if (!user || !user.sub) {
        console.log(`[SeedAdminRoles] No user found with email ${email}, skipping.`);
        continue;
      }

      if (user.admin_role) {
        console.log(
          `[SeedAdminRoles] User ${email} already has role "${user.admin_role}", skipping.`
        );
        continue;
      }

      const permissions: IAdminPermissions = {
        categories: ["all"],
        states: ["all"],
        data_window: "all",
        assigned_by: "system-seed",
        assigned_at: Date.now(),
      };

      await assignRole(user.sub, role, permissions, "system-seed");
      console.log(`[SeedAdminRoles] Assigned role "${role}" to ${email} (sub: ${user.sub})`);
    } catch (err) {
      console.error(`[SeedAdminRoles] Failed to seed ${email}:`, err);
    }
  }
}

/* ================================================================
   6. GET SUPER ADMIN EMAIL FALLBACK
   Exposed so authMiddleware can use the hardcoded fallback (keyed by
   email — see SUPER_ADMIN_EMAILS above for why).
   ================================================================ */
export function getSuperAdminEmailFallback(): Record<string, AdminRole> {
  return { ...SUPER_ADMIN_EMAILS };
}

/**
 * Looks up a user's current email by their Cognito sub. Used by
 * authMiddleware's super-admin fallback check, which only has a sub
 * (from the JWT) and needs the associated email to check against
 * SUPER_ADMIN_EMAILS.
 */
export async function getUserEmailBySub(sub: string): Promise<string | null> {
  const pk = TABLE_PK_MAPPER.User;
  const sk = `${pk}${sub}`;
  const results = await fetchDynamoDB<IUser>("User", sk);
  return results[0]?.email?.toLowerCase() || null;
}
