import SwiftUI

// MARK: - AI 智能体（ReAct + SSE 流式 + 工具卡片）

struct AgentView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var messages: [AgentMessage] = []
    @State private var input = ""
    @State private var running = false

    private let baseURL: URL? = nil

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if messages.isEmpty {
                        ContentUnavailableView(
                            "术力口 AI 智能体",
                            systemImage: "sparkles",
                            description: Text("可查询榜单、分析歌曲、对比趋势、联网搜索。\n需要先在「设置」配置远程后端。")
                        )
                    }
                    ForEach(Array(messages.enumerated()), id: \.offset) { _, msg in
                        AgentBubble(message: msg)
                    }
                }
                .padding()
                .id("bottom")
            }
            .onChange(of: messages.count) { _, _ in
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
        .navigationTitle("AI 智能体")
        .safeAreaInset(edge: .bottom) {
            inputBar
        }
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("问点什么…（榜单/分析/搜索）", text: $input, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .glassEffect(.regular.tint(.brandPrimary.opacity(0.3)), in: .rect(cornerRadius: 20))
                .disabled(running)
            Button {
                Task { await send() }
            } label: {
                Image(systemName: running ? "stop.circle.fill" : "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(running ? Color.warningAmber : Color.brandPrimary)
            }
            .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty && !running)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: 发送 / SSE

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if running {
            running = false
            return
        }
        guard !text.isEmpty, let base = settings.remoteBaseURL else { return }

        messages.append(AgentMessage(role: .user, content: text))
        messages.append(AgentMessage(role: .assistant, content: "", reasoning: "", tools: []))
        input = ""
        running = true
        defer { running = false }

        let history = messages.dropLast().map { AgentTurn(role: $0.role.rawValue, content: $0.content) }
        let url = base.appendingPathComponent("api/ai/agent")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 120
        let body: [String: Any] = [
            "messages": history.map { ["role": $0.role, "content": $0.content] },
            "max_steps": 8,
            "thinking": false,
            "approved": [],
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                appendError("服务返回异常（HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)）")
                return
            }
            for try await line in bytes.lines {
                guard line.hasPrefix("data:") else { continue }
                let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                guard !payload.isEmpty, payload != "[DONE]" else { continue }
                guard let data = payload.data(using: .utf8),
                      let ev = try? JSONDecoder().decode(AgentEvent.self, from: data) else { continue }
                await handle(ev)
                if !running { break }
            }
        } catch let err as URLError where err.code == .cancelled {
            // 用户停止
        } catch {
            appendError("网络错误：\(error.localizedDescription)")
        }
    }

    @MainActor
    private func handle(_ ev: AgentEvent) {
        guard let idx = messages.indices.last else { return }
        switch ev.type {
        case "reasoning":
            if let t = ev.text { messages[idx].reasoning = (messages[idx].reasoning ?? "") + t }
        case "content":
            if let t = ev.text { messages[idx].content += t }
        case "tool_call":
            messages[idx].tools.append(AgentTool(id: ev.id ?? "", name: ev.name ?? "", arguments: ev.arguments ?? "", result: nil, error: nil))
        case "tool_result":
            if let id = ev.id, let i = messages[idx].tools.firstIndex(where: { $0.id == id }) {
                messages[idx].tools[i].result = ev.content ?? ""
            }
        case "tool_error":
            if let id = ev.id, let i = messages[idx].tools.firstIndex(where: { $0.id == id }) {
                messages[idx].tools[i].error = AgentToolError(code: ev.code ?? "?", message: ev.message ?? "调用失败")
            }
        case "done":
            running = false
        case "error":
            appendError(ev.text ?? "未知错误")
        default:
            break
        }
    }

    private func appendError(_ text: String) {
        messages.append(AgentMessage(role: .assistant, content: "⚠️ \(text)", reasoning: "", tools: []))
    }
}

// MARK: - 模型

struct AgentTurn: Codable {
    let role: String
    let content: String
}

struct AgentMessage: Identifiable {
    let id = UUID()
    var role: AgentRole
    var content: String
    var reasoning: String?
    var tools: [AgentTool] = []
    enum AgentRole: String { case user, assistant }
    var isUser: Bool { role == .user }
}

struct AgentTool: Identifiable {
    let id: String
    let name: String
    let arguments: String
    var result: String?
    var error: AgentToolError?
}

struct AgentToolError {
    let code: String
    let message: String
}

struct AgentEvent: Decodable {
    let type: String
    let text: String?
    let id: String?
    let name: String?
    let arguments: String?
    let content: String?
    let code: String?
    let message: String?
    let client: Bool?
    let roundsUsed: Int?
    let maxRounds: Int?
    let objective: String?

    enum CodingKeys: String, CodingKey {
        case type, text, id, name, arguments, content, code, message, client
        case roundsUsed = "rounds_used"
        case maxRounds = "max_rounds"
        case objective
    }
}

// MARK: - 气泡 UI

struct AgentBubble: View {
    let message: AgentMessage

    var body: some View {
        HStack(alignment: .top) {
            if message.isUser { Spacer(minLength: 60) }
            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 8) {
                if message.isUser {
                    Text(message.content)
                        .font(.body)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .glassEffect(.regular.tint(.brandPrimary), in: .rect(cornerRadius: 18))
                } else {
                    if let r = message.reasoning, !r.isEmpty {
                        HStack(spacing: 6) {
                            Image(systemName: "brain").font(.caption2)
                            Text("思考中…").font(.caption).foregroundStyle(.textTertiary)
                        }
                    }
                    ForEach(message.tools) { tool in
                        ToolCard(tool: tool)
                    }
                    if !message.content.isEmpty {
                        Text(message.content)
                            .font(.body)
                            .textSelection(.enabled)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(.cardSurface.opacity(0.5))
                            .glassEffect(in: .rect(cornerRadius: 18))
                    }
                }
            }
            if !message.isUser { Spacer(minLength: 40) }
        }
    }
}

struct ToolCard: View {
    let tool: AgentTool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "wrench.and.screwdriver").font(.caption2).foregroundStyle(Color.brandPrimary)
                Text(tool.name).font(.caption.weight(.semibold))
                Spacer()
                if tool.error != nil {
                    Text("失败 \(tool.error?.code ?? "")").font(.caption2).foregroundStyle(.errorRed)
                } else if tool.result != nil {
                    Image(systemName: "checkmark.circle.fill").font(.caption2).foregroundStyle(.successGreen)
                } else {
                    ProgressView().controlSize(.mini)
                }
            }
            if !tool.arguments.isEmpty {
                Text(tool.arguments)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.textTertiary)
                    .lineLimit(3)
            }
            if let result = tool.result, !result.isEmpty {
                Text(result)
                    .font(.caption)
                    .lineLimit(4)
                    .textSelection(.enabled)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.cardSurface.opacity(0.45))
        .glassEffect(in: .rect(cornerRadius: 14))
    }
}