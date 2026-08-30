import SwiftUI

// MARK: - 收藏页

struct FavoritesView: View {
    @Environment(FavoritesStore.self) private var favorites

    var body: some View {
        List {
            if favorites.items.isEmpty {
                ContentUnavailableView(
                    "暂无收藏",
                    systemImage: "star",
                    description: Text("在榜单页点击星标即可收藏心仪歌曲")
                )
            } else {
                ForEach(favorites.items) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(.body.weight(.medium))
                        if let note = item.note, !note.isEmpty {
                            Text(note)
                                .font(.caption)
                                .foregroundStyle(.textTertiary)
                        }
                        Text(item.addedAt.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption2)
                            .foregroundStyle(.textTertiary)
                    }
                    .padding(.vertical, 4)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Haptics.impact(.medium)
                            favorites.remove(item.bvid)
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle("收藏")
    }
}