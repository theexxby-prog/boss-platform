import { createMiddleware } from "hono/factory";

import { ApiError } from "../http";
import type { AppVariables, EnvBindings } from "../types";

export const requireTenant = createMiddleware<{ Bindings: EnvBindings; Variables: AppVariables }>(async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.tenantId) {
    throw new ApiError(401, "UNAUTHORIZED", "Tenant context is missing");
  }

  const tenantHeader = c.req.header("X-Tenant-ID");
  if (tenantHeader && tenantHeader !== auth.tenantId) {
    throw new ApiError(403, "TENANT_MISMATCH", "X-Tenant-ID does not match authenticated tenant");
  }

  c.set("tenantId", auth.tenantId);
  return next();
});
