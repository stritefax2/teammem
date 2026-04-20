import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(`[${c.req.method}] ${c.req.path}:`, err);

  if (err.message === "Unexpected end of JSON input" || err.message.includes("JSON")) {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }

  const status = "status" in err ? (err as any).status : 500;
  return c.json(
    {
      error: status === 500 ? "Internal server error" : err.message,
    },
    status
  );
};
