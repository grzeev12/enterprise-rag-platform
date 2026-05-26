import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/organizations/new", label: "Organization" },
  { href: "/workspaces/new", label: "Workspace" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/chat", label: "Chat" },
  { href: "/admin", label: "Admin" },
  { href: "/dashboard?module=ingestion", label: "Ingestion" },
  { href: "/dashboard?module=rag", label: "RAG Chat" },
  { href: "/dashboard?module=finops", label: "FinOps" },
  { href: "/dashboard?module=gateway", label: "LLM Gateway" }
];

export function AppShell({ children, user }: AppShellProps) {
  async function logout() {
    "use server";
    await signOut({ redirect: false });
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-muted/20 p-4 md:flex md:flex-col">
        <Link className="mb-8 text-base font-semibold no-underline" href="/dashboard">
          Enterprise AI SaaS
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              className="rounded-md px-3 py-2 text-sm text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t pt-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
              {initials(user.name ?? user.email)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name ?? "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <form action={logout}>
            <Button className="w-full" type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="md:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Link className="font-semibold no-underline" href="/dashboard">
            Enterprise AI SaaS
          </Link>
          <form action={logout}>
            <Button size="sm" type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
