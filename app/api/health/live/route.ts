export async function GET() {
  return Response.json({
    ok: true,
    service: "enterprise-rag-platform",
    at: new Date().toISOString()
  });
}
