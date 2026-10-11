import { GitHubProvider } from "./core/vcs";
import { AuthService } from "./auth/service";
import { Logger } from "./core/logger";
import { defaultHealingConfig } from "./config/healing.config";
import type { DbAdapter } from "./db/adapter";
import type { AiProvider } from "./ai/types";
import type { VcsProvider } from "./core/vcs";
import type { HealingRunner, CodeRunner } from "./core/runner";
import type { HealingConfig } from "./config/healing.config";
import type { AppConfig, CloudflareBindings } from "./env";
import { configFromBindings } from "./env";
import { MemoryRateLimiter } from "./core/ratelimit";
import { RqliteAdapter } from "./db/rqlite";
import { LlmGateway } from "./ai/gateway";
import { handleGuiEvents } from "./core/gui-events";
import type { GuiEvent } from "./core/events";
import { EventDispatcher } from "./core/dispatch";
import { UsageAccumulator } from "./core/usage";
import { SettingsRepository } from "./db/repositories";
import { getSelectedRepo } from "./config/settings.keys";
import { RepoRunner } from "./healing/repo.runner";

/** �N���^�[�Q�b�g�B/version �� /models ���񍐂���B */
export type DeployTarget = "node" | "cloudflare";

/**
 * The full set of platform adapters an Ouroboros deployment wires up.
 * Node �� EventDispatcher �o�R�� in-process �����z���ACloudflare ��
 * Queue �o�C���f�B���O�ւ� send �� `emit` �ɕ������߂�B
 */
export interface Ports {
  ai: AiProvider;
  vcs: VcsProvider;
  db: DbAdapter;
  /** GUI �N�_�C�x���g�̓����iNode: ���� dispatch / Cloudflare: CF Queues�j�B */
  emit(event: GuiEvent): Promise<void>;
  /** RepoRunner �� HealingRunner �� CodeRunner ������������i����C���X�^���X�j�B */
  runner: HealingRunner & CodeRunner;
  rateLimiter: MemoryRateLimiter;
}

export interface WorkerContext {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  /**
   * OURO_REGISTRATION_ENABLED �ɂ��㏑���B���ݒ�ifalse�j�Ȃ� DB �ݒ�ɏ]��
   */
  registrationEnabled?: boolean;
  githubTokenSet: boolean;
  /** Node / Cloudflare �̂ǂ���őg�ݗ��Ă�ꂽ���B */
  deployTarget: DeployTarget;
  /** ���̃R���e�L�X�g������ AI �g�[�N�����v�B */
  usage: UsageAccumulator;
  /** �N�������iversion �\���p�j�B */
  startedAt: string;
  /** ���݂̑Ώۃ��|�W�g���isettings.selected_repo �D��ŉ����ς݁j�B */
  currentRepo: { owner: string; repo: string };
  /** �Ώۃ��|�W�g�������s���ɍ����ւ���ivcs provider �� config.vcs ���~���[�e�[�g�j�B */
  refreshRepo: (owner: string, repo: string) => void;
  /** �v���Z�X��~���ɕ��� */
  close(): Promise<void>;
}

/**
 * Node / Cloudflare ���ʂ� AI �Q�[�g�E�F�C�B�L�[�� config�iNode �� `.env`�A
 * Cloudflare �� env �o�C���f�B���O�� secret�j����ǂށB
 */
export function createLlmGateway(config: AppConfig, usage: UsageAccumulator): LlmGateway {
  return new LlmGateway({
    openaiKey: config.openaiKey,
    anthropicKey: config.anthropicKey,
    xaiKey: config.xaiKey,
    openrouterKey: config.openrouterKey,
    layaKey: config.layaKey,
    onUsage: (event) => usage.record(event),
  });
}

/** �Ώۃ��|�W�g���̉�����: settings.selected_repo �� GITHUB_TOKEN �������o�B */
async function resolveCurrentRepo(
  db: DbAdapter,
  githubToken: string
): Promise<{ owner: string; repo: string }> {
  const selected = await getSelectedRepo(new SettingsRepository(db)).catch(() => null);
  const resolved =
    selected ?? (githubToken ? await GitHubProvider.resolveRepoFromToken(githubToken) : null);
  return { owner: resolved?.owner ?? "", repo: resolved?.repo ?? "" };
}

/**
 * Node / Cloudflare ���ʂ� WorkerContext �g�ݗ��āB
 * Adapter�idb / emit / rateLimiter / ai / vcs�j�̓^�[�Q�b�g�ʂ� build* �֐���
 * �������Ē�������Bvcs �� RepoRunner ����̂� GitHubProvider ��v������̂�
 * ���̌^�Ŏ󂯂�i���^�[�Q�b�g�œ�����������L����j�B
 */
export function assemble(opts: {
  db: DbAdapter;
  emit: (event: GuiEvent) => Promise<void>;
  rateLimiter: MemoryRateLimiter;
  ai: AiProvider;
  vcs: GitHubProvider;
  usage: UsageAccumulator;
  config: AppConfig;
  deployTarget: DeployTarget;
  currentRepo: { owner: string; repo: string };
  /** �V���b�g�_�E���O�ɃC�x���g�z���� drain ����iNode �� EventDispatcher �p�j�B */
  closeEvents?: () => Promise<void>;
}): WorkerContext {
  const { db, emit, rateLimiter, ai, vcs, usage, config, deployTarget, currentRepo, closeEvents } = opts;

  // �o�͐�� stdout �̂݁iCloudflare �ł� Workers Logs�j�B
  const logger = new Logger({ minLevel: "info" });

  // �P��v���Z�X/isolate ���� RepoRunner�iHealingRunner �� CodeRunner ���������j
  const runner = new RepoRunner(vcs, ai, db);

  const healingConfig: HealingConfig = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner: currentRepo.owner,
      repo: currentRepo.repo,
      baseBranch: defaultHealingConfig.vcs.baseBranch,
    },
  };

  const ports: Ports = {
    ai,
    vcs,
    db,
    emit,
    runner,
    rateLimiter,
  };
  const auth = new AuthService(db);

  const refreshRepo = (nextOwner: string, nextRepo: string): void => {
    currentRepo.owner = nextOwner;
    currentRepo.repo = nextRepo;
    vcs.setRepo(nextOwner, nextRepo);
    healingConfig.vcs.owner = nextOwner;
    healingConfig.vcs.repo = nextRepo;
  };

  return {
    ports,
    config: healingConfig,
    auth,
    logger,
    registrationEnabled: config.registrationEnabled,
    githubTokenSet: !!config.githubToken,
    deployTarget,
    usage,
    startedAt: config.startedAt,
    currentRepo,
    refreshRepo,
    close: async () => {
      // Node �� EventDispatcher �� drain ���Ē�~�BCloudflare �� Queue ���z������B
      await closeEvents?.();
      rateLimiter.close();
      // SqliteAdapter �� DatabaseSync �����BD1 / rqlite �͐ڑ��Ǘ��s�v�B
      db.close?.();
    },
  };
}

/** Node ��p�G���g���BDB �h���C�o�[�ɉ����� Adapter ��g�ݗ��Ă�B */
export async function buildContext(config: AppConfig): Promise<WorkerContext> {
  let db: DbAdapter;
  if (config.dbDriver === "rqlite") {
    // SQLite ��ʃR���e�i�� rqlite �œ������\���iDocker �� DB �T�[�r�X�j
    db = new RqliteAdapter({ url: config.rqliteUrl });
  } else {
    // node:sqlite �� Workers �ɖ������� Cloudflare �o���h���֓���Ȃ��悤���I import ����B
    const { SqliteAdapter } = await import("./db/sqlite");
    db = new SqliteAdapter(config.dbPath);
  }
  // �}�C�O���[�V������ node:fs ���g������ Cloudflare �o���h���֓���Ȃ��悤
  // ���I import ����iwrangler ���� `wrangler d1 migrations apply` ���S���j�B
  const { runMigrations } = await import("./db/migrate");
  await runMigrations(db);

  const usage = new UsageAccumulator();
  const ai = createLlmGateway(config, usage);

  // �L���[�͓��� context ���g���񂷁iassemble �̃X�R�[�v�O�Ɏ����o���Ȃ��̂�
  // �ォ�� assign ����z���_����ĎQ�Ƃ���j
  const ctxHolder: { ctx?: WorkerContext } = {};
  const dispatcher = new EventDispatcher({
    onEvent: (event: GuiEvent) => handleGuiEvents([event], ctxHolder.ctx!),
  });
  const emit = (event: GuiEvent): Promise<void> => dispatcher.send(event);
  const rateLimiter = new MemoryRateLimiter();

  const currentRepo = await resolveCurrentRepo(db, config.githubToken);
  const vcs = new GitHubProvider({
    token: config.githubToken,
    owner: currentRepo.owner,
    repo: currentRepo.repo,
  });

  const wctx = assemble({
    db,
    emit,
    rateLimiter,
    ai,
    vcs,
    usage,
    config,
    deployTarget: "node",
    currentRepo,
    closeEvents: async () => {
      await dispatcher.drain(5_000).catch(() => undefined);
      dispatcher.stop();
    },
  });
  ctxHolder.ctx = wctx;
  return wctx;
}

/**
 * Cloudflare ��p�G���g���BD1Adapter + MemoryRateLimiter ��g�ݗ��Ă�B
 * �}�C�O���[�V������ `wrangler d1 migrations apply` ���K�p�ς݂̑O��Ȃ̂�
 * runMigrations() �͌Ă΂Ȃ��i0013 �� ALTER TABLE �͔�p���œ�d�K�p�Ŏ��s����j�B
 */
export async function buildContextFromBindings(env: CloudflareBindings): Promise<WorkerContext> {
  const { D1Adapter } = await import("./db/d1");
  const db = new D1Adapter(env.DB);
  const rateLimiter = new MemoryRateLimiter();

  const config = configFromBindings(env);
  const usage = new UsageAccumulator();
  const ai = createLlmGateway(config, usage);

  const currentRepo = await resolveCurrentRepo(db, config.githubToken);
  const vcs = new GitHubProvider({
    token: config.githubToken,
    owner: currentRepo.owner,
    repo: currentRepo.repo,
  });

  return assemble({
    db,
    emit: async (event: GuiEvent) => {
      await env.GUI_EVENTS.send(event);
    },
    rateLimiter,
    ai,
    vcs,
    usage,
    config,
    deployTarget: "cloudflare",
    currentRepo,
  });
}
