import type { RetrievalQuestion } from "./retrieval";

// The retrieval test set for the example documents (packages/rag/src/examples.ts): spoken
// questions, many worded differently from the documents, and text from the right passage.

export const EXAMPLE_RETRIEVAL_QUESTIONS: RetrievalQuestion[] = [
  { question: "how much for a guys haircut", expected: "men's haircut" },
  { question: "what time do you shut on saturday", expected: "Saturdays from 9am" },
  { question: "are you open sundays", expected: "closed on Sundays" },
  { question: "where can I leave my car", expected: "free parking" },
  { question: "what happens if I need to cancel last minute", expected: "50%" },
  { question: "can I just turn up without booking", expected: "walk-ins" },
  { question: "do you take apple pay", expected: "Apple Pay" },
  { question: "I want to buy a present for my sister", expected: "Gift vouchers" },
  { question: "is there wheelchair access", expected: "step-free" },
  { question: "which shampoo brands do you use", expected: "Davines" },
  { question: "I'm getting married next year, can you do my hair", expected: "bridal" },
  { question: "how much is it for my 8 year old", expected: "£18" },
  { question: "how much is balayage", expected: "balayage" },
  { question: "do I need to do anything before my first colour", expected: "patch test" },
  { question: "who's good with curly hair", expected: "curly" },
  { question: "do I have to pay anything up front", expected: "deposit" },
  { question: "what if I hate my haircut", expected: "within 7 days" },
  { question: "does anyone there speak polish", expected: "Polish" },
];
