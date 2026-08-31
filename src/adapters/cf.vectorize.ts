import type { VectorizePort, VectorizeVector, VectorizeMatch, VectorizeQueryOptions } from "../ports";

export class CfVectorizeAdapter implements VectorizePort {
  constructor(private readonly index: VectorizeIndex) {}

  async upsert(vectors: VectorizeVector[]): Promise<void> {
    await this.index.upsert(vectors);
  }

  async query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatch[]> {
    const result = await this.index.query(vector, {
      topK: options?.topK ?? 5,
      returnMetadata: "all",
      filter: options?.filter,
      namespace: options?.namespace,
    });
    return result.matches.map((m) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata as Record<string, string | number | boolean> | undefined,
    }));
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.index.deleteByIds(ids);
  }
}
