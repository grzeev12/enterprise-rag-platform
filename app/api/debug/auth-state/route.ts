import { auth } from "@/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();

    return Response.json({
      routeReachable: true,
      authenticated: Boolean(session?.user),
      userIdPresent: Boolean(session?.user?.id),
      email: session?.user?.email ?? null
    });
  } catch {
    return Response.json(
      {
        routeReachable: true,
        authenticated: false,
        userIdPresent: false,
        email: null,
        authError: true
      },
      { status: 200 }
    );
  }
}
