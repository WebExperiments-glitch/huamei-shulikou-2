import SwiftUI

// MARK: - 歌曲库（搜索 + 排序，依赖远程后端）

struct SongLibraryView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var items: [SongItem] = []
    @State private var query = ""
    @State private var sort: SongSort = .pubtime
    @State private var isLoading = false
    @State private var hasLoaded = false
    @State private var remoteMissing = false

    var body: some View {
        List {
            if isLoading && items.isEmpty {
                HStack(spacing: 10) { ProgressView(); Text("搜索中…") }
                    .listRowSeparator(.hidden)
            } else if items.isEmpty {
                ContentUnavailableView(
                    hasLoaded ? "没有符合条件的歌曲" : (remoteMissing ? "未配置远程后端" : "暂无数据"),
                    systemImage: "music.note.list",
                    description: Text(remoteMissing ? "在「设置」中填写远程地址即可搜索 / 浏览歌曲库" : "换个关键词或调整筛选试试")
                )
            } else {
                ForEach(items) { song in
                    NavigationLink(value: song.bvid) {
                        SongItemRow(song: song)
                    }
                }
            }
        }
        .navigationTitle("歌曲库")
        .searchable(text: $query, prompt: "歌名 / BV / P主 / 歌姬")
        .navigationDestination(for: String.self) { bvid in
            SongDetailView(bvid: bvid)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Picker("排序", selection: $sort) {
                    ForEach(SongSort.allCases) { s in
                        Text(s.label).tag(s)
                    }
                }
                .pickerStyle(.menu)
            }
        }
        .task { await initialLoad() }
        .task(id: query) {
            try? await Task.sleep(nanoseconds: 350_000_000)
            await load()
        }
        .refreshable { await load() }
    }

    private func initialLoad() async {
        guard !hasLoaded else { return }
        await load()
    }

    private func load() async {
        if settings.remoteBaseURL == nil {
            remoteMissing = true
            hasLoaded = true
            items = []
            return
        }
        isLoading = true
        defer { isLoading = false; hasLoaded = true }
        items = await RemoteAPI.searchSongs(q: query, sort: sort.rawValue, limit: 50, settings: settings)
    }
}

enum SongSort: String, CaseIterable, Identifiable {
    case pubtime = "pubtime"
    case view = "view"
    case favorite = "favorite"
    case coin = "coin"
    case like = "like"
    case weeks = "weeks"
    case bestRank = "best_rank"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .pubtime: return "最新投稿"
        case .view: return "播放"
        case .favorite: return "收藏"
        case .coin: return "硬币"
        case .like: return "点赞"
        case .weeks: return "在榜周数"
        case .bestRank: return "最佳名次"
        }
    }
}

// MARK: - 歌曲行

struct SongItemRow: View {
    let song: SongItem
    @Environment(FavoritesStore.self) private var favorites

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(song.displayTitle)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                if !song.producerNames.isEmpty || !song.vocalistNames.isEmpty {
                    Text([song.vocalistNames, song.producerNames].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.textTertiary)
                        .lineLimit(1)
                }
                HStack(spacing: 14) {
                    MetricChip(systemImage: "play.fill", value: compact(song.view), tint: .brandPrimary)
                    MetricChip(systemImage: "star.fill", value: compact(song.favorite), tint: .warningAmber)
                    MetricChip(systemImage: "dollarsign.circle.fill", value: compact(song.coin), tint: .successGreen)
                }
            }
            Spacer(minLength: 4)
            Button {
                Haptics.selection()
                favorites.toggleSong(song)
            } label: {
                Image(systemName: favorites.isFavorite(song.bvid) ? "star.fill" : "star")
                    .foregroundStyle(favorites.isFavorite(song.bvid) ? Color.warningAmber : Color.textTertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
    }
}