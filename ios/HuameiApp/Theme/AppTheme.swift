import SwiftUI

// MARK: - 品牌色（与 Web 端 antdTheme 对齐：浅色 #3B63D9 / 深色 #7B96F0）

extension Color {
    /// 品牌强调色（蓝紫）
    static let brandPrimary = Color(light: Color(hex: 0x3B63D9), dark: Color(hex: 0x7B96F0))

    /// 分组背景（页面底色）：浅 #F5F6F8 / 深 #0F1115
    static let appBackground = Color(light: Color(hex: 0xF5F6F8), dark: Color(hex: 0x0F1115))

    /// 内容卡片表面：浅 #FFFFFF / 深 #171A20
    static let cardSurface = Color(light: Color(hex: 0xFFFFFF), dark: Color(hex: 0x171A20))

    /// 次级表面（悬浮层/抽屉）：浅 #FFFFFF / 深 #1F232B
    static let elevatedSurface = Color(light: Color(hex: 0xFFFFFF), dark: Color(hex: 0x1F232B))

    /// 三级文字：浅 #8B94A3 / 深 #6B7280
    static let textTertiary = Color(light: Color(hex: 0x8B94A3), dark: Color(hex: 0x6B7280))

    /// 成功 / 警告 / 错误（与 Web 一致）
    static let successGreen = Color(light: Color(hex: 0x0E8A5F), dark: Color(hex: 0x34C98D))
    static let warningAmber = Color(light: Color(hex: 0xA6790A), dark: Color(hex: 0xD4A53A))
    static let errorRed = Color(light: Color(hex: 0xD93848), dark: Color(hex: 0xE05C68))

    /// 播放量等主指标强调色（用于榜单数字）
    static let metricAccent = Color(light: Color(hex: 0x3B63D9), dark: Color(hex: 0x8FA6F5))

    /// 自适应明暗的便捷构造
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }

    /// 从十六进制整数值（0xRRGGBB）构造颜色
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: 1.0
        )
    }
}

// MARK: - ShapeStyle 便捷成员（支持 .foregroundStyle(.brandPrimary) 点语法）

extension ShapeStyle where Self == Color {
    static var brandPrimary: Color { Color.brandPrimary }
    static var textTertiary: Color { Color.textTertiary }
    static var successGreen: Color { Color.successGreen }
    static var warningAmber: Color { Color.warningAmber }
    static var errorRed: Color { Color.errorRed }
}

// MARK: - 全局外观（导航栏/列表背景走系统材质，滚动边缘软过渡）

enum Appearance {
    /// 全局外观配置，须在 App 启动时调用一次
    static func applyGlobal() {
        let nav = UINavigationBar.appearance()
        nav.scrollEdgeAppearance = UINavigationBarAppearance().with { $0.configureWithTransparentBackground() }
        nav.standardAppearance = UINavigationBarAppearance().with { $0.configureWithDefaultBackground() }
    }
}

extension UINavigationBarAppearance {
    func with(_ configure: (UINavigationBarAppearance) -> Void) -> UINavigationBarAppearance {
        configure(self)
        return self
    }
}