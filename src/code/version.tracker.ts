import type { VersionMetadata } from "../env";

export class VersionTracker {
  constructor(private readonly metadata?: VersionMetadata) {}

  async record(sessionId: string): Promise<void> {
    if (!this.metadata) return;
  }

  async list(sessionId: string): Promise<VersionMetadata[]> {
    if (!this.metadata) return [];
    return [this.metadata];
  }
}