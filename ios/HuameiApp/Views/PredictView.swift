import SwiftUI
import Charts

// MARK: - 下期冲榜预测

struct PredictView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var result: PredictResult?
    @State private var loaded = false

    var body: some View {
        List {
            if settings.remoteBaseURL == nil {
                ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark", description: Text("在「设置」中填写远程地址后可查看预测"))
            } else if let result {
                if let cutline = result.cutline {
                    Section("下期晋级线预测") {
                        cutlineCard(cutline)
                    }
                }
                if let entries = result.entries, !entries.isEmpty {
                    Section("冲榜观察") {
                        ForEach(Array(entries.enumerated()), id: \.element.id) { idx, e in
                            HStack {
                                Text("\(idx + 1)").font(.caption.monospacedDigit()).foregroundStyle(.textTertiary)
                                Text(e.title ?? "")
                                    .font(.body.weight(.medium))
                                    .lineLimit(1)
                                Spacer()
                                if let score = e.projectedScore {
                                    Text(String(format: "%.0f", score)).font(.caption.monospacedDigit()).foregroundStyle(.brandPrimary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            } else {
                ContentUnavailableView("暂无预测数据", systemImage: "chart.xyaxis.line", description: Text(loaded ? "数据暂不可用" : "加载中…"))
            }
        }
        .navigationTitle("下期预测")
        .task { await load() }
        .refreshable { await load() }
    }

    private func cutlineCard(_ cutline: PredictCutline) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("晋级线")
                Spacer()
                Text(cutline.predicted.map { String(format: "%.0f", $0) } ?? "—")
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.brandPrimary)
            }
            if let history = cutline.history, !history.isEmpty {
                Chart(history) { p in
                    LineMark(x: .value("期次", p.issue ?? ""), y: .value("线", p.cut ?? 0))
                        .foregroundStyle(Color.brandPrimary)
                    if let top = p.top {
                        LineMark(x: .value("期次", p.issue ?? ""), y: .value("榜首", top))
                            .foregroundStyle(Color.textTertiary)
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4]))
                    }
                }
                .chartXAxis(.hidden)
                .frame(height: 120)
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 6)
    }

    private func load() async {
        defer { loaded = true }
        result = await RemoteAPI.predict(settings: settings)
    }
}