"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { classifyLoginResult, loginErrorMessage, safeCallbackUrl } from "@/lib/auth-login";

export function LoginForm({ debugEnabled = false }: { debugEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function addDebugEvent(event: string) {
    if (!debugEnabled) return;
    setDebugEvents((events) => [...events, event].slice(-8));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
    const dashboardPath = "/dashboard";

    setError(null);
    addDebugEvent("submit started");
    addDebugEvent(`redirect target: ${callbackUrl}`);
    startTransition(async () => {
      try {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl
        });
        addDebugEvent("signIn returned");
        addDebugEvent(`signIn status: ${result?.status ?? "none"}`);
        addDebugEvent(`signIn error: ${result?.error ?? "none"}`);

        const failure = classifyLoginResult(result);
        if (failure) {
          setError(loginErrorMessage(failure));
          return;
        }

        addDebugEvent(`redirect target: ${dashboardPath}`);
        router.replace(dashboardPath);
        router.refresh();
      } catch {
        addDebugEvent("signIn threw");
        setError(`${loginErrorMessage("server_error")} The authentication request did not complete.`);
      }
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your workspace account to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "Signing in..." : "Sign in"}
          </Button>
          {debugEnabled ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Auth debug</p>
              {debugEvents.length ? (
                <ul className="space-y-1">
                  {debugEvents.map((event, index) => (
                    <li key={`${event}-${index}`}>{event}</li>
                  ))}
                </ul>
              ) : (
                <p>No login events yet.</p>
              )}
            </div>
          ) : null}
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          New here?{" "}
          <Link className="font-medium text-foreground hover:underline" href="/signup">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
