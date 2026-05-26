import { auth } from "@/auth";
import { ApiError } from "@/lib/api";

export async function getCurrentUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId || !session.user?.email) {
    return null;
  }

  return {
    id: userId,
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiError(401, "Authentication required");
  }

  return user;
}
