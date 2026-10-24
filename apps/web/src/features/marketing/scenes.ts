// Example calls for the landing page's demo, one per kind of business. Illustrations of what an
// agent does (the businesses are made up); the steps match the platform's real features.

export type SceneStep =
  | { kind: "agent" | "caller"; text: string }
  | { kind: "tool"; name: string; detail: string }
  | { kind: "done"; title: string; detail: string };

export interface Scene {
  id: string;
  label: string;
  business: string;
  steps: SceneStep[];
}

export const SCENES: Scene[] = [
  {
    id: "chauffeur",
    label: "Chauffeur",
    business: "Northline Chauffeurs",
    steps: [
      {
        kind: "agent",
        text: "Good evening, Northline Chauffeurs. A price, a booking, or help with a ride you already have?",
      },
      { kind: "caller", text: "A car from Barajas T4 to the Ritz tomorrow at 9:40, please." },
      { kind: "tool", name: "search_places", detail: "Madrid–Barajas T4 · Hotel Ritz" },
      { kind: "tool", name: "get_quote", detail: "3 vehicles · from €85" },
      {
        kind: "agent",
        text: "An E-Class is €85, fixed, and we wait if your flight lands late. Shall I book it?",
      },
      { kind: "caller", text: "Yes please, under Laura Martín." },
      { kind: "tool", name: "create_booking", detail: "Reference NL-48213" },
      { kind: "done", title: "Ride booked", detail: "Tomorrow 09:40 · E-Class · €85" },
    ],
  },
  {
    id: "clinic",
    label: "Clinic",
    business: "Bright Smile Dental",
    steps: [
      { kind: "agent", text: "Bright Smile Dental, good morning. How can I help?" },
      { kind: "caller", text: "Have you got anything for a cleaning next Tuesday afternoon?" },
      { kind: "tool", name: "check_availability", detail: "Tue 28 Oct · 3 free slots" },
      { kind: "agent", text: "Tuesday I have 2:30, 3:15 or 4:45. Which suits you best?" },
      { kind: "caller", text: "3:15 works for me." },
      { kind: "tool", name: "book_appointment", detail: "Hygiene clean · 45 min" },
      {
        kind: "agent",
        text: "You're booked for 3:15 on Tuesday. I'll text you a reminder the day before.",
      },
      { kind: "done", title: "Appointment booked", detail: "Tue 28 Oct · 15:15 · Hygiene" },
    ],
  },
  {
    id: "salon",
    label: "Salon",
    business: "Studio Nine",
    steps: [
      { kind: "agent", text: "Studio Nine, hi! How can I help today?" },
      { kind: "caller", text: "How much is a cut and colour, and could I come on Saturday?" },
      { kind: "tool", name: "knowledge_lookup", detail: "Price list · Colour services" },
      { kind: "tool", name: "check_availability", detail: "Sat · 2 stylists free" },
      {
        kind: "agent",
        text: "A cut and full colour is £95 with a senior stylist. Saturday at 11 with Maya?",
      },
      { kind: "caller", text: "Perfect, book me in." },
      { kind: "tool", name: "book_appointment", detail: "Sat 11:00 · Maya" },
      { kind: "done", title: "Appointment booked", detail: "Saturday 11:00 · Cut & colour" },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant",
    business: "Olive & Ember",
    steps: [
      { kind: "agent", text: "Olive & Ember, good afternoon. Are you calling about a table?" },
      { kind: "caller", text: "Yes, four of us this Friday around eight. Outside if possible." },
      { kind: "tool", name: "check_tables", detail: "Fri 20:00 · Terrace · 2 free" },
      {
        kind: "agent",
        text: "I have a terrace table for four at 8pm on Friday. Any allergies I should note?",
      },
      { kind: "caller", text: "One of us is coeliac." },
      { kind: "tool", name: "create_reservation", detail: "Note added: coeliac" },
      { kind: "done", title: "Table reserved", detail: "Friday 20:00 · 4 guests · Terrace" },
    ],
  },
];
