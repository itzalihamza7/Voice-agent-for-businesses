// Moving a live call to a person: Twilio's REST API replaces the call's instructions with a
// <Dial>. Without credentials (local development, simulated calls) the transfer is only logged.

export async function transferCall(callSid: string, phoneNumber: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !callSid.startsWith("CA")) {
    return `Would transfer ${callSid} to ${phoneNumber} (no Twilio credentials).`;
  }
  const twiml = `<Response><Dial>${phoneNumber.replace(/[^+\d]/g, "")}</Dial></Response>`;
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Twiml: twiml }),
    },
  );
  return response.ok
    ? `Transferred ${callSid} to ${phoneNumber}.`
    : `Transfer failed: HTTP ${response.status}`;
}
