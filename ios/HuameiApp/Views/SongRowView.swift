import SwiftUI

// MARK: - 榜单歌曲行（液态玻璃卡片）

struct SongRowView: View {
    let entry: RankEntry
    @Environment(FavoritesStore.self) private var favorites

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RankBadge(rank: entry.rank)

            VStack(alignment: .leading, spacing: 6) {
                Text(entry.displayTitle)
                    .font(.body.weight(.medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 14) {
                    MetricChip(systemImage: "play.fill", value: compact(entry.view), tint: .brandPrimary)
                    MetricChip(systemImage: "star.fill", value: compact(entry.favorite), tint: .warningAmber)
                    MetricChip(systemImage: "dollarsign.circle.fill", value: compact(entry.coin), tint: .successGreen)
                    if entry.score != nil {
                        Text("得分 \(entry.displayScore)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.textTertiary)
                    }
                }
            }
            Spacer(minLength: 4)

            Button {
                Haptics.selection()
                favorites.toggle(entry)
            } label: {
                Image(systemName: favorites.isFavorite(entry.bvid) ? "star.fill" : "star")
                    .foregroundStyle(favorites.isFavorite(entry.bvid) ? Color.warningAmber : Color.textTertiary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(favorites.isFavorite(entry.bvid) ? "取消收藏" : "收藏")
        }
        .padding(12)
        .background(.cardSurface.opacity(0.5))
        .glassEffect(in: .rect(cornerRadius: 18))
    }
}

// MARK: - 排名徽标

struct RankBadge: View {
    let rank: Int

    var body: some View {
        Text("\(rank)")
            .font(.caption.weight(.bold).monospacedDigit())
            .foregroundStyle(rank <= 3 ? Color.white : Color.primary)
            .frame(width: 30, height: 30)
            .background { Circle().fill(rankColor) }
    }

    private var rankColor: Color {
        switch rank {
        case 1: return Color(hex: 0xD4A53A) // 金
        case 2: return Color(hex: 0x9AA0AB) // 银
        case 3: return Color(hex: 0xC08A5A) // 铜
        default: return Color(.secondarySystemFill)
        }
    }
}

// MARK: - 指标小标签

struct MetricChip: View {
    let systemImage: String
    let value: String
    var tint: Color = .brandPrimary

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: systemImage)
                .font(.caption2)
            Text(value)
                .font(.caption.monospacedDigit())
        }
        .foregroundStyle(tint)
    }
}

// MARK: - 数字格式化（万/亿）

func compact(_ number: Int) -> String {
    let n = Double(number)
    if n >= 100_000_000 { return String(format: "%.1f亿", n / 100_000_000) }
    if n >= 10_000 { return String(format: "%.1f万", n / 10_000) }
    return String(number)
}