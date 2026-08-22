/** AI 分析领域 API：健康检查/切换模型/流式对话（/api/ai*）。 */
import { request, streamSSE, type AIStreamHandlers, type AIStreamOptions } from "./request"
import type { AiTurn } from "../types"

export const aiApi = {
  aiHealth: () =>
    request<{
      ready: boolean
      base_url?: string
      model?: string
      active?: string
      models?: { key: string; name: string; port: number; up: boolean }[]
      cloud?: boolean
      detail?: string
    }>("/api/ai/health"),
  aiSwitch: (model: string) =>
    request<{ ok: boolean; model?: string; port?: number; active?: string; error?: string }>(
      "/api/ai/switch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      },
    ),
  aiStreamSong: (bvid: string, history: AiTurn[], opts: AIStreamHandlers) =>
    streamSSE("/api/ai/stream-song", { bvid, history, max_tokens: 3584, temperature: 0.6 }, opts),
  aiStream: (opts: AIStreamOptions) =>
    streamSSE(
      "/api/ai/stream",
      {
        system: opts.system ?? null,
        prompt: opts.prompt,
        max_tokens: opts.maxTokens ?? 3584,
        temperature: opts.temperature ?? 0.6,
      },
      opts,
    ),
}

export type { AIStreamHandlers, AIStreamOptions }
