import SwiftUI

// MARK: - 探索中心（分析/音乐/3D 的聚合入口）

struct AnalyticsHubView: View {
    var body: some View {
        List {
            Section("数据洞察") {
                hubLink("洞察中心", "sparkles", .brandPrimary) { InsightsView() }
                hubLink("下期冲榜预测", "chart.xyaxis.line", .brandPrimary) { PredictView() }
                hubLink("歌曲对比", "arrow.left.arrow.right", .successGreen) { CompareView() }
                hubLink("P主榜", "person.crop.square", .brandPrimary) { PeopleView(role: .producers) }
                hubLink("歌姬榜", "music.mic", .brandPrimary) { PeopleView(role: .vocalists) }
            }
            Section("音乐与视觉") {
                hubLink("网易云音乐", "music.note", .warningAmber) { NeteaseView() }
                hubLink("3D 音乐可视化", "cube.transparent", .brandPrimary) { Scene3DHostView() }
            }
        }
        .navigationTitle("探索")
    }

    private func hubLink<D: View>(_ title: String, _ image: String, _ tint: Color,
                                  @ViewBuilder destination: @escaping () -> D) -> some View {
        NavigationLink {
            destination()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: image)
                    .foregroundStyle(tint)
                    .frame(width: 30)
                Text(title)
                    .font(.body.weight(.medium))
            }
            .padding(.vertical, 4)
        }
    }
}