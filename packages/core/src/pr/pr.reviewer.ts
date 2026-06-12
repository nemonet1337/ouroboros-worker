import { HealingConfig } from "../config/healing.config";
import type { AiProvider } from "../ports/ai";
import type { VcsProvider } from "../ports/vcs";

export interface ReviewResult {
  approved: boolean;
  comments: Array<{ path: string; line: number; body: string }>;
  summary: string;
  newIssuesFound: boolean;
  autoMergeEligible: boolean;
}

const SYSTEM_PROMPT = `You are a senior security-focused code reviewer.
Review the provided pull request diff and respond ONLY with a valid JSON object (no markdown, no preamble).

Schema:
{
  "approved": boolean,
  "comments": [{ "path": string, "line": number, "body": string }],
  "summary": "1-3 sentences in Japanese describing the review outcome",
  "newIssuesFound": boolean,
  "autoMergeEligible": boolean
}

Rules:
- autoMergeEligible MUST be true only when approved=true AND newIssuesFound=false.
- approved=true if the fix correctly addresses the reported issue without introducing new problems.
- newIssuesFound=true if you detect any new security vulnerabilities or regressions.
- summary must be written in Japanese.
- If JSON parsing would fail, return: {"approved":false,"comments":[],"summary":"レビュー処理中にエラーが発生しました。","newIssuesFound":false,"autoMergeEligible":false}`;

export class PRReviewer {
  constructor(
    private readonly config: HealingConfig,
    private readonly ai: AiProvider,
    private readonly vcs: VcsProvider
  ) {}

  async review(prNumber: number): Promise<ReviewResult> {
    const fallback: ReviewResult = {
      approved: false,
      comments: [],
      summary: "レビュー処理中にエラーが発生しました。手動レビューが必要です。",
      newIssuesFound: false,
      autoMergeEligible: false,
    };

    try {
      const files = await this.vcs.listPRFiles(prNumber);
      const diffSummary = files
        .map((f) => `File: ${f.filename}\nChanges: +${f.additions} -${f.deletions}\n${f.patch ?? ""}`)
        .join("\n\n---\n\n")
        .slice(0, 20_000);

      const prompt = `Review this self-healing pull request (PR #${prNumber}):

Changed files diff:
${diffSummary}

Determine if this fix is safe to auto-merge.`;

      const text = await this.ai.complete({
        model: this.config.ai.model,
        maxTokens: 2048,
        system: SYSTEM_PROMPT,
        prompt,
      });

      const result = JSON.parse((text || "{}").replace(/```json|```/g, "").trim()) as ReviewResult;
      result.autoMergeEligible = result.approved && !result.newIssuesFound;
      return result;
    } catch (err) {
      console.error("[PRReviewer] review failed:", err);
      return fallback;
    }
  }
}
