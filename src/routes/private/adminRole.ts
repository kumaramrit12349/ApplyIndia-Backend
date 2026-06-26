import { Router } from "express";
import {
  authenticateTokenAndEmail,
  requireRole,
  invalidateAdminCache,
} from "../../middlewares/authMiddleware";
import {
  getAllAdminUsers,
  assignRole,
  removeRole,
  lookupUserByEmail,
} from "../../services/private/adminRoleService";
import { AdminRole, IAdminPermissions } from "../../db_schema/User/UserInterface";

const router = Router();

// All admin-role routes require authentication + admin role
router.use(authenticateTokenAndEmail);

/**
 * GET /api/admin-roles
 * List all users with an admin role.
 * Role: admin only
 */
router.get("/", requireRole("admin"), async (_req, res) => {
  try {
    const adminUsers = await getAllAdminUsers();

    // Map to a clean response (don't leak sensitive fields)
    const users = adminUsers.map((u) => ({
      sub: u.sub,
      email: u.email,
      given_name: u.given_name,
      family_name: u.family_name,
      admin_role: u.admin_role,
      admin_permissions: u.admin_permissions,
    }));

    res.json({ success: true, users });
  } catch (error: any) {
    console.error("Error listing admin users:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to list admin users",
    });
  }
});

/**
 * POST /api/admin-roles/assign
 * Assign or update a role + permissions for a user.
 * Role: admin only
 *
 * Body: {
 *   email: string,
 *   role: "creator" | "reviewer" | "admin",
 *   permissions: {
 *     categories: string[],
 *     states: string[],
 *     data_window: string
 *   }
 * }
 */
router.post("/assign", requireRole("admin"), async (req: any, res) => {
  try {
    const { email, role, permissions } = req.body;

    // Validation
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        error: "Email and role are required",
      });
    }

    const validRoles: AdminRole[] = ["creator", "reviewer", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    if (!permissions || !permissions.categories || !permissions.states || !permissions.data_window) {
      return res.status(400).json({
        success: false,
        error: "Permissions must include categories, states, and data_window",
      });
    }

    // Look up the user by email
    const user = await lookupUserByEmail(email);
    if (!user || !user.sub) {
      return res.status(404).json({
        success: false,
        error: `No registered user found with email: ${email}`,
      });
    }

    const assignedBySub = req.user?.sub || "unknown";

    const adminPermissions: IAdminPermissions = {
      categories: permissions.categories,
      states: permissions.states,
      data_window: permissions.data_window,
    };

    await assignRole(user.sub, role, adminPermissions, assignedBySub);

    // Invalidate cache so the change is reflected immediately
    await invalidateAdminCache();

    res.json({
      success: true,
      message: `Role "${role}" assigned to ${email}`,
      user: {
        sub: user.sub,
        email: user.email,
        given_name: user.given_name,
        family_name: user.family_name,
        admin_role: role,
        admin_permissions: adminPermissions,
      },
    });
  } catch (error: any) {
    console.error("Error assigning admin role:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to assign role",
    });
  }
});

/**
 * DELETE /api/admin-roles/:sub
 * Remove admin access for a user.
 * Role: admin only
 */
router.delete("/:sub", requireRole("admin"), async (req: any, res) => {
  try {
    const { sub } = req.params;

    if (!sub) {
      return res.status(400).json({
        success: false,
        error: "User sub is required",
      });
    }

    // Prevent removing your own admin role
    if (sub === req.user?.sub) {
      return res.status(400).json({
        success: false,
        error: "You cannot remove your own admin role",
      });
    }

    await removeRole(sub);

    // Invalidate cache
    await invalidateAdminCache();

    res.json({
      success: true,
      message: "Admin role removed successfully",
    });
  } catch (error: any) {
    console.error("Error removing admin role:", error);
    const status = error?.message?.includes("super-admin") ? 403 : 500;
    res.status(status).json({
      success: false,
      error: error?.message || "Failed to remove role",
    });
  }
});

export default router;
