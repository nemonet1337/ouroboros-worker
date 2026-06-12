// Fallback ambient types for the `cloudflare:workers` runtime module, in case
// the installed @cloudflare/workers-types version does not ship them.
declare module "cloudflare:workers" {
  export interface WorkflowEvent<P> {
    payload: P;
    instanceId: string;
    timestamp: Date;
  }

  export interface WorkflowStepConfig {
    retries?: { limit: number; delay: number | string; backoff?: "constant" | "linear" | "exponential" };
    timeout?: number | string;
  }

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: number | string): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  }

  export abstract class WorkflowEntrypoint<Env = unknown, P = unknown> {
    constructor(ctx: ExecutionContext, env: Env);
    protected env: Env;
    protected ctx: ExecutionContext;
    abstract run(event: WorkflowEvent<P>, step: WorkflowStep): Promise<unknown>;
  }
}
