import { headers } from "next/headers";

// The business a request acts for. The proxy checks the session and sets x-business-id; it
// removes any value the client sent, so this header can be trusted on the server.

export class UnauthorizedError extends Error {
  constructor(message = "Sign in first.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function currentBusinessId(): Promise<string> {
  const businessId = (await headers()).get("x-business-id");
  if (!businessId) throw new UnauthorizedError();
  return businessId;
}
