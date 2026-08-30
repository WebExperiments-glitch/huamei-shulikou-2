import SwiftUI

// MARK: - 榜单总览（各类型入口）

struct BoardsView: View {
    @Environment(BoardRepository.self) private var repo

    var body: some View {
        List {
            Section("榜单") {
                ForEach(BoardType.allCases) { type in
                    NavigationLink(value: type) {
                        BoardTypeRow(type: type, latest: repo.localIssues(type).first)
                    }
                }
            }
        }
        .navigationTitle("榜单")
        .navigationDestination(for: BoardType.self) { type in
            BoardIssuesView(type: type)
        }
    }
}

/// 榜单类型行：图标 + 名称 + 最新期次
private struct BoardTypeRow: View {
    let type: BoardType
    let latest: BoardIssue?

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: type.systemImage)
                .font(.title3)
                .foregroundStyle(Color.brandPrimary)
                .frame(width: 36, height: 36)
                .glassEffect(.regular.tint(.brandPrimary), in: .circle)
            VStack(alignment: .leading, spacing: 2) {
                Text(type.title)
                    .font(.body.weight(.medium))
                Text(latest?.displayDate ?? "暂无期次")
                    .font(.caption)
                    .foregroundStyle(.textTertiary)
            }
            Spacer()
            if let latest {
                Text("#\(latest.issue)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.textTertiary)
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - 期次列表

struct BoardIssuesView: View {
    let type: BoardType
    @Environment(BoardRepository.self) private var repo
    @Environment(SettingsStore.self) private var settings

    private var issues: [BoardIssue] { repo.localIssues(type) }

    var body: some View {
        List {
            if issues.isEmpty {
                ContentUnavailableView(
                    "暂无期次",
                    systemImage: "rectangle.stack",
                    description: Text("离线快照无 \(type.title) 数据。连接远程后端后可下拉刷新。")
                )
            } else {
                ForEach(issues) { issue in
                    NavigationLink(value: issue.issue) {
                        HStack {
                            Text(issue.issue)
                                .font(.body.monospacedDigit())
                            Spacer()
                            Text(issue.displayDate)
                                .font(.caption)
                                .foregroundStyle(.textTertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("\(type.title) · 期次")
        .navigationDestination(for: String.self) { issue in
            BoardDetailView(type: type, issue: issue)
        }
        .refreshable {
            await repo.refreshIssues(type, using: settings)
        }
        .task {
            if issues.isEmpty { await repo.refreshIssues(type, using: settings) }
        }
    }
}

// MARK: - 单期详情（排名列表）

struct BoardDetailView: View {
    let type: BoardType
    let issue: String
    @Environment(BoardRepository.self) private var repo
    @Environment(SettingsStore.self) private var settings

    private var rows: [RankEntry] { repo.localRankings(type, issue: issue) }

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
        .navigationTitle("\(type.title) · \(issue)")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await repo.refreshRankings(type, issue: issue, using: settings)
        }
        .task {
            if rows.isEmpty { await repo.refreshRankings(type, issue: issue, using: settings) }
        }
    }
}