import type { ErrorRequestHandler, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const secret = process.env.JWT_SECRET;
if (!secret || (process.env.NODE_ENV === "production" && secret.startsWith("change-me"))) {
  throw new Error("JWT_SECRET must be set to a long random value");
}
export const JWT_SECRET: string = secret;
export const AUTH_COOKIE = "token";

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, "Not signed in");
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as { sub: string };
    res.locals.userId = Number(payload.sub);
  } catch {
    throw new HttpError(401, "Session expired, please sign in again");
  }
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) {
    return void res.status(400).json({
      error: err.issues[0]?.message ?? "Invalid input",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

export const idParam = (value: unknown) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "Not found");
  return id;
};
