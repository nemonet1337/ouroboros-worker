export interface VectorizeVector {
  id: string;
  values: number[];
  namespace?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeQueryOptions {
  topK?: number;
  filter?: Record<string, string | number | boolean>;
  namespace?: string;
}

export interface VectorizePort {
  upsert(vectors: VectorizeVector[]): Promise<void>;
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatch[]>;
  deleteByIds(ids: string[]): Promise<void>;
}
