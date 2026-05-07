const { RoleAccessRelation, Access } = require("../models");
const { sendError } = require("../functions/sendResponse");

/**
 * RBAC Middleware
 * @param {Object} options - { accessKey: 'MODULE_CODE', permission: 'view'|'action'|'edit' }
 */
module.exports = (options = {}) => {
  return async (req, res, next) => {
    try {
      const { accessKey, permission = "view" } = options;

      if (!accessKey) {
        return sendError(next, "RBAC configuration error: accessKey is required", 500);
      }

      const permissionMap = {
        view: "can_view",
        action: "can_perform_action",
        edit: "can_edit"
      };

      const permissionField = permissionMap[permission];
      if (!permissionField) {
        return sendError(next, "RBAC configuration error: invalid permission type", 500);
      }

      // 1. Check if user is injected by authMiddleware
      if (!req.user) {
        return sendError(next, "Unauthorized user", 401);
      }

      const role = req.user.role;

      // 2. SuperAdmin bypass
      if (role?.role_name === "SuperAdmin") {
        return next();
      }

      const roleId = role?.role_id;
      if (!roleId) {
        return sendError(next, "Role not assigned", 403);
      }

      // 3. Find the specific module (e.g., 'ALARM_DASHBOARD' or 'ALARM_ACTIONS')
      const access = await Access.findOne({
        where: {
          module_code: accessKey,
        },
      });

      if (!access) {
        return sendError(next, `Access module '${accessKey}' not defined in DB`, 403);
      }

      // 4. Check if this role has a relation to this access module
      const roleAccess = await RoleAccessRelation.findOne({
        where: {
          role_id: roleId,
          access_id: access.access_id,
        },
      });

      if (!roleAccess || !roleAccess[permissionField]) {
        return sendError(next, "Access denied: Insufficient permissions", 403);
      }

      console.log(
        `✅ RBAC OK → role=${role.role_name}, module=${accessKey}, permission=${permission}, method=${req.method}`
      );

      next();
    } catch (err) {
      console.error("❌ Access middleware error:", err.message);
      return sendError(next, "Access validation failed", 403);
    }
  };
};