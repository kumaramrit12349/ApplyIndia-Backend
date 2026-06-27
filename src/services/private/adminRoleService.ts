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
   ================================================================ */
const SUPER_ADMIN_SUBS: Record<string, AdminRole> = {
  "71e3ed0a-50e1-703a-f403-b96b7377db22": "admin",
  "41134dfa-8081-7054-8696-98f8c6c26461": "admin",
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
   Cannot remove super-admin fallback users.
   ================================================================ */
export async function removeRole(sub: string): Promise<void> {
  if (SUPER_ADMIN_SUBS[sub]) {
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
   One-time migration: writes admin_role + permissions to the
   existing hardcoded admin subs. Idempotent — skips if already set.
   ================================================================ */
export async function seedDefaultAdminRoles(): Promise<void> {
  const defaults = Object.entries(SUPER_ADMIN_SUBS).map(([sub, role]) => ({
    sub,
    role,
  }));


  for (const { sub, role } of defaults) {
    try {
      const pk = TABLE_PK_MAPPER.User;
      const sk = `${pk}${sub}`;
      const results = await fetchDynamoDB<IUser>("User", sk);

      if (results.length === 0) {
        console.log(`[SeedAdminRoles] User ${sub} not found in DB, skipping.`);
        continue;
      }

      const user = results[0];
      if (user.admin_role) {
        console.log(
          `[SeedAdminRoles] User ${sub} already has role "${user.admin_role}", skipping.`
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

      await assignRole(sub, role, permissions, "system-seed");
      console.log(`[SeedAdminRoles] Assigned role "${role}" to ${sub}`);
    } catch (err) {
      console.error(`[SeedAdminRoles] Failed to seed ${sub}:`, err);
    }
  }
}

/* ================================================================
   6. GET SUPER ADMIN FALLBACK
   Exposed so authMiddleware can use the hardcoded fallback.
   ================================================================ */
export function getSuperAdminFallback(): Record<string, AdminRole> {
  return { ...SUPER_ADMIN_SUBS };
}
