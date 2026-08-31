import type { EmbeddingProvider } from "@voice-agent/pipeline";
import type { ChunkingStrategy } from "./chunking";
import { chunkText, embedChunks, type EmbeddingStats } from "./ingest";
import type { KnowledgeStore } from "./store";

// Example documents for the demo business, a hair salon called High Street Hair. They fill
// the knowledge base on a fresh install (`npm run kb:seed`) or from the knowledge base page,
// so the demo agent has something to answer from. Each uses the chunking that suits it.
// Some questions are deliberately not covered (tattoos, nails, massages): the agent should
// say it doesn't know.

export interface ExampleDocument {
  title: string;
  chunking: ChunkingStrategy;
  text: string;
}

export const EXAMPLE_DOCUMENTS: ExampleDocument[] = [
  {
    title: "Salon FAQ (example)",
    chunking: "headings",
    text: `# Prices
A men's haircut costs £30 and a women's cut and blow-dry costs £45. Beard trims are £15. Children under 12 pay £18. Colour treatments start at £60 depending on hair length.

# Opening hours
We are open Monday to Friday from 9am to 6pm and on Saturdays from 9am to 5pm. We are closed on Sundays and on bank holidays.

# Location and parking
You'll find us at 14 High Street, next to the post office. There is free parking for customers behind the salon, and the number 22 bus stops right outside.

# Cancellations and late arrivals
Please give us at least 24 hours' notice if you need to cancel or move your appointment. Cancellations with less notice are charged 50% of the price. If you arrive more than 15 minutes late we may need to shorten your service.

# Walk-ins
We welcome walk-ins whenever a stylist is free, but weekends get busy, so booking ahead is safer.

# Payment
We accept cash, all major debit and credit cards, Apple Pay and Google Pay. We don't accept cheques.

# Children
Children of all ages are welcome. We have a booster seat and the under-12 price is £18.

# Gift vouchers
Gift vouchers are available for any amount from £10. They are valid for 12 months and can be bought in the salon or over the phone.

# Accessibility
The salon is on the ground floor with step-free access and an accessible toilet. Assistance dogs are welcome.

# Products
We use and sell organic hair care products from Davines and Aveda. Ask your stylist for advice on what suits your hair.

# Covid and hygiene
All tools are cleaned between customers and towels are washed at 60 degrees.

# Wedding and events
We offer bridal hair packages, including a trial session. Please book wedding hair at least two months in advance.`,
  },
  {
    title: "Services and price list (example)",
    chunking: "headings",
    text: `# Cuts and styling
Men's haircut, 30 minutes: £30. Women's cut and blow-dry, 60 minutes: £45. Blow-dry only, 45 minutes: £28. Children's cut (under 12), 30 minutes: £18. Fringe trim between appointments: free for existing customers.

# Beard and grooming
Beard trim, 15 minutes: £15. Hot towel shave, 30 minutes: £25. Haircut and beard trim together: £40.

# Colour
Root touch-up, 60 minutes: from £60. Full head colour, 90 minutes: from £75. Half head highlights: from £85. Full head highlights or balayage, 2 to 3 hours: from £120. Toner or gloss: £30. Prices depend on hair length and thickness; your stylist confirms the price before starting.

# Treatments
Olaplex bond repair treatment, 30 minutes: £35, or £20 when added to a colour. Deep conditioning treatment: £15. Keratin smoothing, about 3 hours: from £150.

# Bridal and occasions
Bridal hair package including one trial session: £180. Bridesmaid or guest styling: £55 per person. Up-dos for parties and proms: £50.

# Stylist levels
Prices above are for our senior stylists. Appointments with a junior stylist are 20% cheaper. Appointments with Sarah, our creative director, cost 20% more.`,
  },
  {
    title: "Booking and cancellation policy (example)",
    chunking: "semantic",
    text: `You can book an appointment by phone, online or at the reception desk. We confirm every booking by text message, and we send a reminder the day before your appointment.

For colour treatments over £100 we ask for a deposit of £20 when you book. The deposit is taken off your final bill. It is refunded if you cancel at least 24 hours before your appointment.

If you need to cancel or move your appointment, please tell us at least 24 hours in advance. If you cancel with less notice, we charge 50% of the price of the booked service. If you don't come at all and don't tell us, we charge the full price, and we may ask for a deposit for future bookings.

If you are more than 15 minutes late, we may have to shorten your service or move you to a later time, so that the next customer isn't kept waiting. The full price still applies.

Before your first colour with us, you need a quick allergy patch test at least 48 hours before the appointment. It takes five minutes, it's free, and you can pop in for it any time we're open without booking.

If you're not happy with your cut or colour, tell us within 7 days and we will fix it free of charge. We don't give cash refunds for services that have been carried out.`,
  },
  {
    title: "About High Street Hair (example)",
    chunking: "fixed",
    text: `High Street Hair is an independent, family-run salon that opened in 2012. We have six stylists and a junior team who are training with us.

Sarah, our creative director and founder, specialises in colour and balayage. Tom is our barber and looks after most men's cuts, beard trims and hot towel shaves. Priya specialises in curly and textured hair and in bridal styling. Our stylists speak English, Polish and Hindi.

We care about the planet: we use refillable product bottles, recycle foils and colour tubes, and our electricity comes from renewable sources.

We offer a free consultation for anyone who's thinking about a big change, such as a new colour or a much shorter cut. It takes about fifteen minutes and you can book it like any other appointment.

The salon has free Wi-Fi and we serve tea, coffee and soft drinks.`,
  },
];

export interface ExampleSeedResult {
  added: string[];
  alreadyThere: string[];
  embedding: EmbeddingStats[];
}

/**
 * Adds the example documents that aren't in the knowledge base yet (matched by title), each
 * chunked with its own strategy and embedded with every model. Fails if a model can't embed,
 * so no example is stored half-embedded.
 */
export async function addExampleDocuments(
  store: Pick<KnowledgeStore, "listDocuments" | "addDocument">,
  models: EmbeddingProvider[],
): Promise<ExampleSeedResult> {
  const existing = new Set((await store.listDocuments()).map((doc) => doc.title));
  const result: ExampleSeedResult = { added: [], alreadyThere: [], embedding: [] };
  for (const example of EXAMPLE_DOCUMENTS) {
    if (existing.has(example.title)) {
      result.alreadyThere.push(example.title);
      continue;
    }
    const chunks = await chunkText(example.text, example.chunking, models[0] ?? null);
    const { embeddings, stats } = await embedChunks(chunks, models);
    await store.addDocument({
      title: example.title,
      sourceType: "text",
      chunking: example.chunking,
      content: example.text,
      chunks,
      embeddings,
    });
    result.added.push(example.title);
    result.embedding.push(...stats);
  }
  return result;
}
