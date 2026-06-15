import type { VectorizePort, VectorizeVector, VectorizeMatch } from "../ports";

export class CfVectorizeAdapter implements VectorizePort {
  constructor(private readonly index: VectorizeIndex) {}

  async upsert(vectors: VectorizeVector[]): Promise<void> {
    await this.index.upsert(vectors);
  }

  async query(
    vector: number[],
    options?: { topK?: number; filter?: Record<string, string | number | boolean> }
  ): Promise<VectorizeMatch[]> {
    const result = await this.index.query(vector, {
      topK: options?.topK ?? 5,
      returnMetadata: "all",
      filter: options?.filter,
    });
    return result.matches.map((m) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata as Record<string, string | number | boolean> | undefined,
    }));
  }
}
