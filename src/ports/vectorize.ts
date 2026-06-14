export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizePort {
  upsert(vectors: VectorizeVector[]): Promise<void>;
  query(
    vector: number[],
    options?: {
      topK?: number;
      filter?: Record<string, string | number | boolean>;
    }
  ): Promise<VectorizeMatch[]>;
}
