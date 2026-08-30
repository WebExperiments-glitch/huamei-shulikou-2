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

    /// iPhone：底部标签栏（系统自动液态玻璃）
    private func iPhoneRoot() -> some View {
        TabView {
            Tab("榜单", systemImage: "chart.line.uptrend.xyaxis") {
                NavigationStack { BoardsView() }
            }
            Tab("收藏", systemImage: "star") {
                NavigationStack { FavoritesView() }
            }
            Tab("设置", systemImage: "gearshape") {
                NavigationStack { SettingsView() }
            }
        }
    }

    /// iPad：侧边栏 + 内容三区
    private func iPadRoot() -> some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(SplitSection.allCases) { item in
                    Label(item.title, systemImage: item.image)
                        .tag(item)
                }
            }
            .navigationTitle("术力口")
            .navigationSplitViewColumnWidth(min: 200, ideal: 230)
        } detail: {
            switch selection ?? .boards {
            case .boards: NavigationStack { BoardsView() }
            case .favorites: NavigationStack { FavoritesView() }
            case .settings: NavigationStack { SettingsView() }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    @State private var selection: SplitSection? = .boards
}

private enum SplitSection: String, CaseIterable, Identifiable, Hashable {
    case boards, favorites, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .boards: return "榜单"
        case .favorites: return "收藏"
        case .settings: return "设置"
        }
    }

    var image: String {
        switch self {
        case .boards: return "chart.line.uptrend.xyaxis"
        case .favorites: return "star"
        case .settings: return "gearshape"
        }
    }
}