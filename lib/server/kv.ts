/**
 * Vercel KV（＝ Upstash Redis）の REST API を fetch で呼ぶ小さなクライアント。
 * 計測（stats.ts）と課金（billing.ts）で共通に使う。
 * 環境変数 KV_REST_API_URL / KV_REST_API_TOKEN（または UPSTASH_REDIS_REST_URL / _TOKEN）が無ければ null。
 */
export type Env = Record<string, string | undefined>;
export interface KvConfig {
  url: string;
  token: string;
}

export function kvConfig(env: Env = process.env): KvConfig | null {
  const url = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
  const token = (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

/** 複数コマンドを 1 往復で実行する（/pipeline）。HTTP エラー・コマンドエラーは例外 */
export async function kvPipeline(cfg: KvConfig, commands: (string | number)[][], timeoutMs: number): Promise<unknown[]> {
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = json.find((r) => r && r.error);
  if (failed) throw new Error(`KV error: ${failed.error}`);
  return json.map((r) => r?.result);
}

/** 1 コマンドだけ実行 */
export async function kv(cfg: KvConfig, command: (string | number)[], timeoutMs = 3000): Promise<unknown> {
  return (await kvPipeline(cfg, [command], timeoutMs))[0];
}

/** JSON で保存した値を読む（無ければ null） */
export async function kvGetJson<T>(cfg: KvConfig, key: string, timeoutMs = 3000): Promise<T | null> {
  const raw = await kv(cfg, ["GET", key], timeoutMs);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
