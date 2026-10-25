// POST /api/business/data/rotate-key: gives the business a new data key and re-seals all its
// secrets with it (owners only). Old values stop opening with the old key.
import { currentBusinessId } from "@/server/business";
import { rotateDataKey } from "@/server/vault";

export async function POST() {
  return Response.json({ resealed: await rotateDataKey(await currentBusinessId()) });
}
