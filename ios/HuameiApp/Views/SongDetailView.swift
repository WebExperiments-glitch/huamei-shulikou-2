import SwiftUI
import Charts

// MARK: - 歌曲详情（基本信息 + 上榜历史趋势）

struct SongDetailView: View {
    let bvid: String
    @Environment(SettingsStore.self) private var settings
    @Environment(FavoritesStore.self) private var favorites

    @State private var detail: SongDetail?
    @State private var history: [SongHistoryEntry] = []
    @State private var loaded = false
    @State private var remoteMissing = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if remoteMissing {
                    noRemoteHint
                }
                if let detail {
                    headerCard(detail)
                }
                if !history.isEmpty {
                    historyCard
                }
                if loaded && detail == nil && !remoteMissing {
                    ContentUnavailableView("未找到歌曲", systemImage: "questionmark.circle", description: Text(bvid))
                        .frame(maxWidth: .infinity)
                        .padding(.top, 24)
                }
            }
            .padding()
        }
        .background(Color.appBackground)
        .navigationTitle("歌曲详情")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let detail {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Haptics.selection()
                        favorites.toggleSong(songItem(from: detail))
                    } label: {
                        Image(systemName: favorites.isFavorite(bvid) ? "star.fill" : "star")
                            .foregroundStyle(favorites.isFavorite(bvid) ? Color.warningAmber : Color.textTertiary)
                    }
                }
            }
        }
        .task { await load() }
    }

    private var noRemoteHint: some View {
        Label("未配置远程后端，详情不可用。请在「设置」填写远程地址。", systemImage: "wifi.exclamationmark")
            .font(.caption)
            .foregroundStyle(.textTertiary)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular.tint(.warningAmber), in: .rect(cornerRadius: 14))
    }

    private func headerCard(_ d: SongDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(d.titleCn ?? d.title ?? bvid)
                    .font(.title3.weight(.bold))
                if let cn = d.titleCn, cn != d.title, let title = d.title, !title.isEmpty {
                    Text(title)
                        .font(.body)
                        .foregroundStyle(.textTertiary)
                }
                if let prod = d.producers, !prod.isEmpty {
                    Text("P主：" + prod.compactMap(\.name).joined(separator: " / "))
                        .font(.footnote)
                        .foregroundStyle(.brandPrimary)
                }
                if let voc = d.vocalists, !voc.isEmpty {
                    Text("歌姬：" + voc.compactMap(\.name).joined(separator: " / "))
                        .font(.footnote)
                        .foregroundStyle(.textTertiary)
                }
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                metric("播放", d.view.map(compact) ?? "—", "play.fill", .brandPrimary)
                metric("收藏", d.favorite.map(compact) ?? "—", "star.fill", .warningAmber)
                metric("硬币", d.coin.map(compact) ?? "—", "dollarsign.circle.fill", .successGreen)
                metric("点赞", d.like.map(compact) ?? "—", "hand.thumbsup.fill", Color.brandPrimary)
                metric("最佳名次", d.bestRank.map { "#\($0)" } ?? "—", "trophy.fill", Color.warningAmber)
                metric("在榜周数", d.weeksOnBoard.map { "\($0) 周" } ?? "—", "calendar", Color.textTertiary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.cardSurface.opacity(0.5))
        .glassEffect(in: .rect(cornerRadius: 20))
    }

    private func metric(_ label: String, _ value: String, _ image: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(label, systemImage: image)
                .font(.caption)
                .foregroundStyle(.textTertiary)
            Text(value)
                .font(.body.weight(.bold).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var historyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("上榜历史")
                .font(.headline)
            // 周榜名次趋势优先展示
            let weekly = history.filter { $0.boardType == "weekly" }
            if !weekly.isEmpty {
                rankTrendChart(entries: weekly)
            } else {
                rankTrendChart(entries: history)
            }
            legendRow
        }
        .padding(16)
        .background(.cardSurface.opacity(0.5))
        .glassEffect(in: .rect(cornerRadius: 20))
    }

    private func rankTrendChart(entries: [SongHistoryEntry]) -> some View {
        let sorted = entries.sorted { ($0.issue ?? "") < ($1.issue ?? "") }
        return Chart(Array(sorted.enumerated()), id: \.element.id) { idx, entry in
            LineMark(
                x: .value("期次", idx),
                y: .value("名次", -(Double(entry.rank ?? 0)))
            )
            .foregroundStyle(Color.brandPrimary)
            PointMark(
                x: .value("期次", idx),
                y: .value("名次", -(Double(entry.rank ?? 0)))
            )
            .foregroundStyle(Color.brandPrimary)
            .annotation(position: .top, spacing: 4) {
                Text("\(entry.rank ?? 0)")
                    .font(.system(size: 9).monospacedDigit())
                    .foregroundStyle(.textTertiary)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading)
        }
        .frame(height: 180)
    }

    private var legendRow: some View {
        HStack(spacing: 14) {
            ForEach(history.map(\.boardType).removingDuplicates()) { type in
                Text(SongHistoryEntry(boardType: type, issue: nil, rank: nil, score: nil, view: nil, favorite: nil, coin: nil, like: nil).boardLabel)
                    .font(.caption)
                    .foregroundStyle(.textTertiary)
            }
            Spacer()
            Text("共 \(history.count) 次上榜")
                .font(.caption)
                .foregroundStyle(.textTertiary)
        }
    }

    private func load() async {
        guard settings.remoteBaseURL != nil else {
            remoteMissing = true
            loaded = true
            return
        }
        async let d = RemoteAPI.song(bvid, settings: settings)
        async let h = RemoteAPI.songHistory(bvid, settings: settings)
        let (detailResult, historyResult) = await (d, h)
        detail = detailResult
        history = historyResult
        loaded = true
    }

    private func songItem(from d: SongDetail) -> SongItem {
        SongItem(
            bvid: d.bvid ?? bvid,
            title: d.title ?? "",
            titleCn: d.titleCn,
            view: d.view ?? 0,
            favorite: d.favorite ?? 0,
            coin: d.coin ?? 0,
            like: d.like ?? 0,
            share: d.share ?? 0,
            score: nil,
            pubtime: d.pubtime
        )
    }
}

extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}