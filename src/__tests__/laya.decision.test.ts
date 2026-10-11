import { describe, it, expect, vi, afterEach } from "vitest";
import {
  adaptAnswers,
  decideLaya,
  normalizeScoreAnswer,
  toWireQuestions,
} from "../ai/decisions";
import type { AiDecisionRequest } from "../ai/types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function capture(): { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return json({ answers: {} });
    })
  );
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const REQ: AiDecisionRequest = {
  state: "task state",
  questions: {
    difficulty: { type: "score", instructions: "難度", rubric: { "1": "容易", "3": "中", "5": "困難" } },
    tier: { type: "choice", instructions: "層", criteria: { efficiency: "e", performance: "p" } },
    needed: { type: "noul", instructions: "必要?" },
  },
};

describe("toWireQuestions", () => {
  it("turns a score rubric into a numerically ascending criteria array", () => {
    const wire = toWireQuestions({
      difficulty: { type: "score", instructions: "i", rubric: { "5": "困難", "1": "容易", "3": "中" } },
    });
    expect(wire.difficulty).toEqual({
      type: "score",
      instructions: "i",
      criteria: ["容易", "中", "困難"],
    });
  });

  it("keeps a choice question's criteria object", () => {
    const wire = toWireQuestions({
      tier: { type: "choice", instructions: "i", criteria: { efficiency: "e", performance: "p" } },
    });
    expect(wire.tier).toEqual({ type: "choice", instructions: "i", criteria: { efficiency: "e", performance: "p" } });
  });

  it("drops criteria for a noul question", () => {
    const wire = toWireQuestions({ needed: { type: "noul", instructions: "i" } });
    expect(wire.needed).toEqual({ type: "noul", instructions: "i" });
  });
});

describe("decideLaya", () => {
  it("POSTs {url}/v1/systemone with model, state and questions", async () => {
    const { calls } = capture();
    await decideLaya({ url: "http://127.0.0.1:8000", model: "typed-decisions" }, REQ);

    expect(calls[0].url).toBe("http://127.0.0.1:8000/v1/systemone");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("typed-decisions");
    expect(body.state).toBe("task state");
    expect(body.questions.difficulty.criteria).toEqual(["容易", "中", "困難"]);
    expect(body.questions.needed).toEqual({ type: "noul", instructions: "必要?" });
  });

  it("trims a trailing slash and sends a bearer token when a key is given", async () => {
    const { calls } = capture();
    await decideLaya({ url: "http://127.0.0.1:8000/", model: "english" }, REQ, "laya-secret");

    expect(calls[0].url).toBe("http://127.0.0.1:8000/v1/systemone");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer laya-secret");
  });

  it("omits Authorization when no key is configured", async () => {
    const { calls } = capture();
    await decideLaya({ url: "http://127.0.0.1:8000", model: "english" }, REQ);

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("truncates the state to 1500 characters", async () => {
    const { calls } = capture();
    await decideLaya(
      { url: "http://127.0.0.1:8000", model: "typed-decisions" },
      { state: "x".repeat(5000), questions: {} }
    );

    expect(JSON.parse(calls[0].init.body as string).state).toHaveLength(1500);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "bad" }, 500))
    );
    await expect(
      decideLaya({ url: "http://127.0.0.1:8000", model: "typed-decisions" }, REQ)
    ).rejects.toThrow(/laya/);
  });
});

describe("normalizeScoreAnswer", () => {
  it("shifts a 0-based probability map into 1..5", () => {
    const out = normalizeScoreAnswer({ probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 } }) as {
      score: number;
      probabilities: Record<string, number>;
    };
    expect(out.probabilities).toEqual({ "1": 0.1, "2": 0.6, "3": 0.3 });
    expect(out.score).toBe(2);
  });

  it("shifts a bare score index by +1", () => {
    expect(normalizeScoreAnswer(0)).toEqual({ score: 1 });
    expect(normalizeScoreAnswer(4)).toEqual({ score: 5 });
  });

  it("keeps a non-score answer untouched", () => {
    expect(normalizeScoreAnswer({ choice: "performance" })).toEqual({
      choice: "performance",
      score: 3,
    });
  });
});

describe("adaptAnswers", () => {
  it("maps a named answers array to a record", () => {
    const out = adaptAnswers(
      [
        { name: "difficulty", answer: { score: 1 } },
        { name: "tier", answer: { choice: "efficiency" } },
      ],
      ["difficulty", "tier"]
    );
    expect(out).toEqual({ difficulty: { score: 1 }, tier: { choice: "efficiency" } });
  });

  it("maps a bare answers object straight through", () => {
    expect(adaptAnswers({ difficulty: { score: 2 } }, ["difficulty"])).toEqual({
      difficulty: { score: 2 },
    });
  });

  it("falls back to positional names for anonymous entries", () => {
    expect(adaptAnswers([{ score: 2 }], ["difficulty"])).toEqual({ difficulty: { score: 2 } });
  });
});
