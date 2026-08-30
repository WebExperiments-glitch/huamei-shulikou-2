import SwiftUI

/// 根视图：iPhone（compact）TabView / iPad（regular）NavigationSplitView 自适应
struct RootTabView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var favorites = FavoritesStore()
    @State private var repository = BoardRepository()

    var body: some View {
        Group {
            if sizeClass == .regular {
                iPadRoot()
            } else {
                iPhoneRoot()
            }
        }
        .environment(favorites)
        .environment(repository)
    }

    /// iPhone：底部标签栏（系统自动液态玻璃；第 6 个及之后自动进「更多」由系统收纳）
    private func iPhoneRoot() -> some View {
        TabView {
            Tab("榜单", systemImage: "chart.line.uptrend.xyaxis") {
                NavigationStack { BoardsView() }
            }
            Tab("歌曲", systemImage: "music.note.list") {
                NavigationStack { SongLibraryView() }
            }
            Tab("热度", systemImage: "flame") {
                NavigationStack { HotView() }
            }
            Tab("AI", systemImage: "sparkles") {
                NavigationStack { AgentView() }
            }
            Tab("设置", systemImage: "gearshape") {
                NavigationStack { SettingsView() }
            }
            Tab("探索", systemImage: "square.grid.2x2") {
                NavigationStack { AnalyticsHubView() }
            }
        }
    }

    /// iPad：侧边栏 + 内容三区
    private func iPadRoot() -> some View {
        NavigationSplitView {
            List(selection: $selection) {
                Section("数据") {
                    sidebarLink(.boards, "榜单", "chart.line.uptrend.xyaxis")
                    sidebarLink(.monthly, "月榜", "chart.bar.fill")
                    sidebarLink(.daily, "日榜", "sun.max.fill")
                    sidebarLink(.songs, "歌曲", "music.note.list")
                    sidebarLink(.hot, "实时热度", "flame")
                }
                Section("智能") {
                    sidebarLink(.ai, "AI 智能体", "sparkles")
                }
                Section("音乐与视觉") {
                    sidebarLink(.netease, "网易云", "music.note")
                    sidebarLink(.scene, "3D 可视化", "cube.transparent")
                }
                Section("分析") {
                    sidebarLink(.insights, "洞察中心", "sparkles")
                    sidebarLink(.predict, "下期预测", "chart.xyaxis.line")
                    sidebarLink(.compare, "歌曲对比", "arrow.left.arrow.right")
                    sidebarLink(.producers, "P主榜", "person.crop.square")
                    sidebarLink(.vocalists, "歌姬榜", "music.mic")
                }
                Section("系统") {
                    sidebarLink(.settings, "设置", "gearshape")
                }
            }
            .navigationTitle("术力口")
            .navigationSplitViewColumnWidth(min: 210, ideal: 240)
        } detail: {
            detailView(for: selection ?? .boards)
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder
    private func detailView(for section: SplitSection) -> some View {
        switch section {
        case .boards: NavigationStack { BoardsView() }
        case .monthly: NavigationStack { MonthDailyView(kind: .monthly) }
        case .daily: NavigationStack { MonthDailyView(kind: .daily) }
        case .songs: NavigationStack { SongLibraryView() }
        case .hot: NavigationStack { HotView() }
        case .ai: NavigationStack { AgentView() }
        case .netease: NavigationStack { NeteaseView() }
        case .scene: NavigationStack { Scene3DHostView() }
        case .insights: NavigationStack { InsightsView() }
        case .predict: NavigationStack { PredictView() }
        case .compare: NavigationStack { CompareView() }
        case .producers: NavigationStack { PeopleView(role: .producers) }
        case .vocalists: NavigationStack { PeopleView(role: .vocalists) }
        case .settings: NavigationStack { SettingsView() }
        }
    }

    private func sidebarLink(_ section: SplitSection, _ title: String, _ image: String) -> some View {
        Label(title, systemImage: image).tag(section)
    }

    @State private var selection: SplitSection? = .boards
}

private enum SplitSection: String, CaseIterable, Identifiable, Hashable {
    case boards, monthly, daily, songs, hot, ai, netease, scene, insights, predict, compare, producers, vocalists, settings
    var id: String { rawValue }
}