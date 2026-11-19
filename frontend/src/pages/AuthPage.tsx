import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { errorMessage } from "../api";
import { useAuth } from "../auth";

import { Button, Card, ErrorBox, Logo } from "../components/ui";

const schemas = {
  login: z.object({ email: z.email("Enter a valid email"), password: z.string().min(1, "Enter your password") }),
  register: z.object({
    email: z.email("Enter a valid email"),
    password: z.string().min(10, "At least 10 characters"),
  }),
};
type Form = z.infer<typeof schemas.login>;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register: signUp } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schemas[mode]) });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await (mode === "login" ? login(email, password) : signUp(email, password));
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    }
  });

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-cyan-500";
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size="lg" />
          <p className="text-sm text-slate-500">Monitor your websites for security weaknesses and vulnerabilities.</p>
        </div>
        <Card>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <h1 className="text-lg font-semibold text-slate-900">{mode === "login" ? "Sign in" : "Create an account"}</h1>
            {serverError && <ErrorBox>{serverError}</ErrorBox>}
            <label className="block space-y-1 text-sm">
              <span className="text-slate-700">Email</span>
              <input type="email" autoComplete="email" className={input} {...register("email")} />
              {formState.errors.email && <span className="text-xs text-red-700">{formState.errors.email.message}</span>}
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-700">Password</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={input}
                {...register("password")}
              />
              {formState.errors.password && <span className="text-xs text-red-700">{formState.errors.password.message}</span>}
            </label>
            <Button type="submit" className="w-full" loading={formState.isSubmitting}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? "No account? " : "Already have an account? "}
          <Link className="text-cyan-700 hover:underline" to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Create one" : "Sign in"}
          </Link>
        </p>
      </div>
    </div>
  );
}
