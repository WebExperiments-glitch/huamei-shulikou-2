import SwiftUI

// MARK: - 月榜 / 日榜（期次 + 排名，复用榜单行样式）

struct MonthDailyView: View {
    let kind: MonthDailyKind
    @Environment(SettingsStore.self) private var settings
    @State private var issues: [BoardIssue] = []
    @State private var loaded = false

    var body: some View {
        List {
            if settings.remoteBaseURL == nil {
                ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark",
                                       description: Text("在「设置」中填写远程地址后可查看 \(kind.title)"))
            } else if issues.isEmpty {
                ContentUnavailableView("暂无期次", systemImage: "rectangle.stack", description: Text(loaded ? "该榜暂无数据" : "加载中…"))
            } else {
                ForEach(issues) { issue in
                    NavigationLink(value: issue.issue) {
                        HStack {
                            Text(issue.issue).font(.body.monospacedDigit())
                            Spacer()
                            Text(issue.displayDate).font(.caption).foregroundStyle(.textTertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle(kind.title)
        .navigationDestination(for: String.self) { issue in
            MonthDailyDetailView(kind: kind, issue: issue)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loaded = true }
        issues = await RemoteAPI.monthDailyIssues(kind.apiPath, settings: settings)
    }
}

enum MonthDailyKind: String, CaseIterable, Identifiable {
    case monthly, daily
    var id: String { rawValue }
    var title: String { self == .monthly ? "月榜" : "日榜" }
    var systemImage: String { self == .monthly ? "chart.bar.fill" : "sun.max.fill" }
    var apiPath: String { rawValue }
}

struct MonthDailyDetailView: View {
    let kind: MonthDailyKind
    let issue: String
    @Environment(SettingsStore.self) private var settings
    @State private var rows: [RankEntry] = []

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(rows) { entry in
                    SongRowView(entry: entry)
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
        }
        .background(Color.appBackground)
        .navigationTitle("\(kind.title) · \(issue)")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        rows = await RemoteAPI.monthDailyRankings(kind.apiPath, issue: issue, settings: settings)
    }
}