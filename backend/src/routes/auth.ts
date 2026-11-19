import { compare, hash, hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AUTH_COOKIE, HttpError, JWT_SECRET, requireAuth } from "../lib/http.js";

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { error: "Too many attempts, try again later" } });

const email = z.email("Enter a valid email address").max(254).transform((s) => s.toLowerCase());
const registerSchema = z.object({
  email,
  password: z.string().min(10, "Password must be at least 10 characters").max(128),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

// Used so login takes the same time whether or not the email exists.
const DUMMY_HASH = hashSync("timing-equalizer", 12);

function setSession(res: Response, userId: number) {
  const token = jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

authRouter.post("/register", authLimiter, async (req, res) => {
  const { email, password } = registerSchema.parse(req.body);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new HttpError(409, "An account with this email already exists");
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await hash(password, 12) })
    .returning({ id: users.id, email: users.email });
  setSession(res, user.id);
  res.status(201).json({ user });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Invalid email or password");
  setSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (_req, res) => {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, res.locals.userId));
  if (!user) throw new HttpError(401, "Not signed in");
  res.json({ user });
});
