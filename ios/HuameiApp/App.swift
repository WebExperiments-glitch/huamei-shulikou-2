import SwiftUI
import Observation

/// huamei术力口 —— 原生 SwiftUI 客户端（iOS 26 / iPadOS 26）
///
/// 设计取向（品牌原生路线）：
/// - 系统 HIG 控件 + 液态玻璃（Liquid Glass），保留 Web 端品牌蓝紫身份
/// - iPhone：TabView；iPad：NavigationSplitView 自适应
/// - 数据：内置只读快照（离线可用）+ 可配置远程 FastAPI（实时/AI/网易云）
@main
struct HuameiApp: App {
    @State private var settings = SettingsStore()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(settings)
                .tint(.brandPrimary)
                .preferredColorScheme(settings.colorScheme == .dark ? .dark : .light)
                .onAppear {
                    Appearance.applyGlobal()
                }
        }
    }
}