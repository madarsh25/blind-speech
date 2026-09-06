import { createServerFn } from "@tanstack/react-start";
import { getOptionalAuth } from "./auth-server";

export const getMe = createServerFn({ method: "GET" })
  .handler(async () => {
    const user = await getOptionalAuth();
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      companyDomain: user.companyDomain,
    };
  });
