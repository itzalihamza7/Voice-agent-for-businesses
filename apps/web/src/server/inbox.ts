import { currentUser } from "./auth";
import { currentBusinessId } from "./business";

/** The signed-in team member, for Inbox actions (their name is shown to the visitor). */
export async function staffMember() {
  const [user, businessId] = await Promise.all([currentUser(), currentBusinessId()]);
  if (!user) throw new Error("Sign in first.");
  return {
    businessId,
    staff: { userId: user.userId, name: user.name.split(/\s+/)[0] ?? user.name },
  };
}
