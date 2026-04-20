import type { AuthContext } from "./middleware/auth.js";

export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};
