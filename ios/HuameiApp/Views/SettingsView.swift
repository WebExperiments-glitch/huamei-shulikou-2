import SwiftUI

// MARK: - 设置页（远程后端 / 外观 / 关于）

struct SettingsView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var remoteText = ""
    @State private var checkResult: String?
    @State private var isChecking = false

    var body: some View {
        Form {
            Section("数据源") {
                LabeledContent("当前模式") {
                    Text(settings.modeDescription)
                        .font(.caption)
                        .foregroundStyle(.textTertiary)
                        .multilineTextAlignment(.trailing)
                }
                TextField("远程地址（如 http://192.168.1.5:8010）", text: $remoteText)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Section {
                Button {
                    Task { await runConnectionCheck() }
                } label: {
                    if isChecking {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("检测中…")
                        }
                    } else {
                        Label("连接测试", systemImage: "wifi")
                    }
                }
                .disabled(isChecking)

                if let checkResult {
                    Text(checkResult)
                        .font(.caption)
                }
            } footer: {
                Text("连接远程 FastAPI 后，榜单实时刷新、AI 智能体、网易云等功能才会激活；未配置时使用内置离线快照。")
            }

            Section("外观") {
                Picker("外观", selection: appearanceBinding) {
                    Text("跟随系统").tag(ColorSchemePreference.system)
                    Text("浅色").tag(ColorSchemePreference.light)
                    Text("深色").tag(ColorSchemePreference.dark)
                }
                .pickerStyle(.menu)
            }

            Section("关于") {
                LabeledContent("版本", value: "V0.2.0.1 RC 2")
                LabeledContent("客户端", value: "原生 SwiftUI · iOS 26")
                LabeledContent("数据", value: "内置快照 + 远程可选")
            }
        }
        .navigationTitle("设置")
        .onAppear {
            remoteText = settings.remoteBaseURL?.absoluteString ?? ""
        }
        .onChange(of: remoteText) { _, new in
            let trimmed = new.trimmingCharacters(in: .whitespacesAndNewlines)
            settings.remoteBaseURL = trimmed.isEmpty ? nil : URL(string: trimmed)
        }
    }

    private var appearanceBinding: Binding<ColorSchemePreference> {
        Binding(
            get: { settings.colorScheme },
            set: { settings.colorScheme = $0 }
        )
    }

    private func runConnectionCheck() async {
        isChecking = true
        defer { isChecking = false }
        guard let base = settings.remoteBaseURL else {
            checkResult = "请先填写远程地址"
            return
        }
        do {
            let health: HealthResponse = try await APIClient.shared.get("api/health", baseURL: base)
            checkResult = "连接成功：\(health.status)，版本 \(health.version ?? "?")"
            Haptics.success()
        } catch {
            checkResult = "连接失败：\(error.localizedDescription)"
        }
    }
}

/// /api/health 响应
struct HealthResponse: Decodable, Sendable {
    let status: String
    let version: String?
    let app: String?
}