import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthDebugEnabled } from "@/lib/auth-debug";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Suspense>
        <LoginForm debugEnabled={isAuthDebugEnabled()} />
      </Suspense>
    </main>
  );
}
