import { getPrisma } from "./store";

/**
 * Deletes an agent of the business with everything that belongs to it: its versions, evals,
 * releases, website widget and chats, and its call history. Its phone number is freed.
 */
export async function deleteAgent(businessId: string, agentId: string): Promise<boolean> {
  const { count } = await getPrisma().agent.deleteMany({ where: { id: agentId, businessId } });
  return count > 0;
}
