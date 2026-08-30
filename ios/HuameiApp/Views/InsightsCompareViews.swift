import SwiftUI
import Charts

// MARK: - 数据分析 / 洞察中心

struct InsightsView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var overview: InsightOverview?
    @State private var loaded = false

    var body: some View {
        List {
            if settings.remoteBaseURL == nil {
                ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark", description: Text("在「设置」中填写远程地址后可查看洞察"))
            } else if let overview {
                if let kpis = overview.kpis {
                    Section("数据总览") {
                        kpiRow("收录歌曲", "\(kpis.songsTotal ?? 0)", "music.note.list", .brandPrimary)
                        kpiRow("官方榜单期数", "\(kpis.boardCount ?? 0)", "list.number", .successGreen)
                    }
                }
                if let freshness = overview.freshness {
                    Section("数据新鲜度") {
                        kpiRow("最新周榜", freshness.latestWeeklyIssue ?? "—", "calendar", .brandPrimary)
                        if let age = freshness.ageDays {
                            kpiRow("距今天数", "\(age) 天", "clock", (freshness.stale ?? false) ? .warningAmber : .successGreen)
                        }
                        if freshness.stale == true {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.warningAmber)
                                Text("数据已过期，可让 AI 智能体触发“同步官方榜单”")
                                    .font(.caption)
                                    .foregroundStyle(.textTertiary)
                            }
                        }
                    }
                }
            } else {
                ContentUnavailableView("暂无洞察数据", systemImage: "sparkles", description: Text(loaded ? "数据暂不可用" : "加载中…"))
            }
        }
        .navigationTitle("数据分析")
        .task { await load() }
        .refreshable { await load() }
    }

    private func kpiRow(_ label: String, _ value: String, _ image: String, _ tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: image)
                .foregroundStyle(tint)
                .frame(width: 28)
            Text(label)
                .foregroundStyle(.textTertiary)
            Spacer()
            Text(value)
                .font(.body.weight(.bold).monospacedDigit())
        }
    }

    private func load() async {
        defer { loaded = true }
        overview = await RemoteAPI.insights(settings: settings)
    }
}

// MARK: - 歌曲对比

struct CompareView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var a = ""
    @State private var b = ""
    @State private var historyA: [SongHistoryEntry] = []
    @State private var historyB: [SongHistoryEntry] = []

    var body: some View {
        List {
            Section("选择对比歌曲（BV 号）") {
                TextField("BVID A，如 BV1xxx", text: $a)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.characters)
                TextField("BVID B，如 BV1yyy", text: $b)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.characters)
                Button {
                    Task { await compare() }
                } label: {
                    Label("开始对比", systemImage: "arrow.left.arrow.right")
                }
            }
            if !historyA.isEmpty || !historyB.isEmpty {
                Section("周榜名次走势（越高越好）") {
                    CompareChart(historyA: historyA, historyB: historyB)
                        .frame(height: 220)
                        .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle("歌曲对比")
    }

    private func compare() async {
        guard !a.trimmingCharacters(in: .whitespaces).isEmpty,
              !b.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        async let ha = RemoteAPI.songHistory(a, settings: settings)
        async let hb = RemoteAPI.songHistory(b, settings: settings)
        (historyA, historyB) = await (ha.filter { $0.boardType == "weekly" }, hb.filter { $0.boardType == "weekly" })
    }
}

struct CompareChart: View {
    let historyA: [SongHistoryEntry]
    let historyB: [SongHistoryEntry]

    var body: some View {
        Chart {
            ForEach(Array(historyA.enumerated()), id: \.element.id) { idx, e in
                LineMark(x: .value("期", idx), y: .value("名次", -(Double(e.rank ?? 0))))
                    .foregroundStyle(Color.brandPrimary)
            }
            ForEach(Array(historyB.enumerated()), id: \.element.id) { idx, e in
                LineMark(x: .value("期", idx), y: .value("名次", -(Double(e.rank ?? 0))))
                    .foregroundStyle(Color.successGreen)
            }
        }
        .chartXAxis(.hidden)
    }
}