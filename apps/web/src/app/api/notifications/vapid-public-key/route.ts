export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return Response.json({ publicKey: null });
  }
  return Response.json({ publicKey: key });
}
