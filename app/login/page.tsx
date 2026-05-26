import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthDebugEnabled } from "@/lib/auth-debug";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Suspense>
        <LoginForm debugEnabled={isAuthDebugEnabled()} />
      </Suspense>
    </main>
  );
}
