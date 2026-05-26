export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      disabled: true,
      replacement: "/api/debug/session"
    },
    { status: 410 }
  );
}
