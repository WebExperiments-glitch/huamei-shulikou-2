import SwiftUI

// MARK: - 液态玻璃（Liquid Glass）封装组件
// iOS 26 原生玻璃材质：系统实时折射背景 + 随设备倾角高光 + 触控响应。

/// 玻璃容器：多个玻璃元素共享采样区域，避免相邻玻璃间折射伪影/不一致
struct GlassContainer<Content: View>: View {
    var spacing: CGFloat = 12
    @ViewBuilder var content: Content

    var body: some View {
        GlassEffectContainer(spacing: spacing) {
            content
        }
    }
}

/// 品牌液态玻璃面板：默认圆角矩形玻璃，可着色/可交互
struct GlassPanel<Content: View>: View {
    var tint: Color?
    var interactive = false
    var cornerRadius: CGFloat = 20
    @ViewBuilder var content: Content

    private var glass: Glass {
        var g = Glass.regular
        if let tint { g = g.tint(tint) }
        if interactive { g = g.interactive() }
        return g
    }

    var body: some View {
        content
            .glassEffect(glass, in: .rect(cornerRadius: cornerRadius))
    }
}

/// 液态玻璃按钮样式（品牌主操作）
struct BrandGlassButtonStyle: ButtonStyle {
    var tint: Color = .brandPrimary
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .glassEffect(.regular.tint(tint).interactive(), in: .capsule)
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - 玻璃数字卡（榜单指标用）

/// 榜单指标玻璃卡：标题 + 大数字（支持数字滚动动画）
struct MetricGlassCard: View {
    let title: String
    let value: String
    var tint: Color = .brandPrimary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.textTertiary)
            Text(value)
                .font(.system(.title2, design: .rounded).weight(.bold))
                .contentTransition(.numericText())
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.cardSurface.opacity(0.55))
        .glassEffect(.regular.tint(tint), in: .rect(cornerRadius: 16))
    }
}

// MARK: - 触感反馈

enum Haptics {
    @MainActor
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    @MainActor
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    @MainActor
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}