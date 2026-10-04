// Topic clustering: group similar calls by the embeddings of their intent and summary. Greedy:
// each call joins the first topic whose centre is similar enough, else starts a new one. Good
// enough for the hundreds of calls a small business gets; no clustering library needed.

export interface Topic<T> {
  items: T[];
  centre: number[];
}

export function clusterByEmbedding<T>(
  items: T[],
  vectors: number[][],
  minSimilarity = 0.8,
): Topic<T>[] {
  const topics: { items: T[]; sum: number[] }[] = [];
  items.forEach((item, i) => {
    const vector = vectors[i]!;
    let best: (typeof topics)[number] | undefined;
    let bestScore = minSimilarity;
    for (const topic of topics) {
      const score = cosine(vector, topic.sum);
      if (score >= bestScore) {
        best = topic;
        bestScore = score;
      }
    }
    if (best) {
      best.items.push(item);
      best.sum = best.sum.map((v, k) => v + vector[k]!);
    } else {
      topics.push({ items: [item], sum: [...vector] });
    }
  });
  return topics
    .sort((a, b) => b.items.length - a.items.length)
    .map((t) => ({ items: t.items, centre: t.sum.map((v) => v / t.items.length) }));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
