import { theme as antdTheme } from "antd"
import type { ThemeConfig } from "antd"

/**
 * 统一 Ant Design 主题设计系统。
 * 与 index.css 的极简高级中性色板保持同一套 token，深浅模式共用。
 * 强调色：浅色 #3b63d9 / 深色 #7b96f0。
 */
export function antdConfig(dark: boolean): ThemeConfig {
  const primary = dark ? "#7b96f0" : "#3b63d9"
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorInfo: primary,
      colorLink: primary,
      colorSuccess: dark ? "#34c98d" : "#0e8a5f",
      colorWarning: dark ? "#d4a53a" : "#a6790a",
      colorError: dark ? "#e05c68" : "#d93848",
      colorBgBase: dark ? "#0f1115" : "#f5f6f8",
      colorBgContainer: dark ? "#171a20" : "#ffffff",
      colorBgElevated: dark ? "#1f232b" : "#ffffff",
      colorBgLayout: dark ? "#0f1115" : "#f5f6f8",
      colorBorder: dark ? "#2a2f3a" : "#e2e6ec",
      colorBorderSecondary: dark ? "#232833" : "#e9edf2",
      colorText: dark ? "#e6e9ee" : "#16191f",
      colorTextSecondary: dark ? "#a7adb8" : "#4d5768",
      colorTextTertiary: dark ? "#6b7280" : "#8b94a3",
      borderRadius: 10,
      borderRadiusSM: 8,
      fontSize: 14,
      controlHeight: 36,
      fontFamily: `"Inter", system-ui, "Segoe UI", "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif`,
    },
    components: {
      Menu: {
        itemBg: "transparent",
        itemSelectedBg: dark ? "#232c4a" : "#e4ecfb",
        itemSelectedColor: primary,
        itemHoverBg: dark ? "#1f232b" : "#eef1f5",
        itemBorderRadius: 8,
        itemMarginInline: 4,
        itemHeight: 38,
        groupTitleColor: dark ? "#6b7280" : "#8b94a3",
        groupTitleFontSize: 11,
      },
      Card: {
        paddingLG: 20,
        borderRadiusLG: 12,
        headerBg: "transparent",
      },
      Table: {
        headerBg: dark ? "#1a1e25" : "#f0f2f6",
        headerColor: dark ? "#a7adb8" : "#4d5768",
        borderColor: dark ? "#232833" : "#e9edf2",
        rowHoverBg: dark ? "#1f232b" : "#f5f7fa",
      },
      Layout: {
        siderBg: dark ? "#171a20" : "#ffffff",
        headerBg: dark ? "#171a20" : "#ffffff",
        bodyBg: dark ? "#0f1115" : "#f5f6f8",
      },
      Segmented: {
        itemSelectedBg: dark ? "#232c4a" : "#ffffff",
        trackBg: dark ? "#1f232b" : "#eef1f5",
      },
      Tag: {
        defaultBg: "transparent",
      },
      Drawer: {
        colorBgElevated: dark ? "#171a20" : "#ffffff",
      },
    },
  }
}
