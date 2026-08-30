import SwiftUI

// MARK: - 实时热度（综合榜 + 涨幅榜）

struct HotView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var mode: HotMode = .score
    @State private var items: [HeatItem] = []
    @State private var loaded = false

    var body: some View {
        List {
            if settings.remoteBaseURL == nil {
                ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark",
                                       description: Text("在「设置」中填写远程地址后可查看实时热度"))
            } else if items.isEmpty {
                ContentUnavailableView("暂无热度数据", systemImage: "flame",
                                       description: Text(loaded ? "可先在上方下拉刷新，或在「设置」连接后端后重试" : "加载中…"))
            } else {
                Section {
                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                        HeatRow(item: item, index: idx)
                    }
                } header: {
                    Text(mode == .score ? "综合热度榜" : "涨速飙升榜")
                }
            }
        }
        .navigationTitle("实时热度")
        .safeAreaInset(edge: .top) {
            Picker("模式", selection: $mode) {
                ForEach(HotMode.allCases) { m in
                    Text(m.label).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .background(.ultraThinMaterial)
        }
        .task { await load() }
        .task(id: mode) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loaded = true }
        items = mode == .score
            ? await RemoteAPI.hotSongs(sort: "score", limit: 50, settings: settings)
            : await RemoteAPI.hotMomentum(limit: 30, settings: settings)
    }
}

enum HotMode: String, CaseIterable, Identifiable {
    case score, momentum
    var id: String { rawValue }
    var label: String { self == .score ? "综合榜" : "涨幅榜" }
}

struct HeatRow: View {
    let item: HeatItem
    let index: Int

    var body: some View {
        HStack(spacing: 12) {
            Text("\(index + 1)")
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(Color.brandPrimary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title ?? "")
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                HStack(spacing: 12) {
                    MetricChip(systemImage: "play.fill", value: compact(item.view ?? 0), tint: .brandPrimary)
                    if let delta = item.deltaView, delta > 0 {
                        MetricChip(systemImage: "arrow.up.right", value: "+\(compact(delta))", tint: .successGreen)
                    }
                    if let momentum = item.momentum {
                        MetricChip(systemImage: "bolt.fill", value: String(format: "%.1f", momentum), tint: .warningAmber)
                    }
                }
            }
            Spacer()
        }
        .padding(.vertical, 6)
    }
}