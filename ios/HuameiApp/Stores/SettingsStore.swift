import Foundation
import Observation
import SwiftUI

// MARK: - 设置（远程后端地址 / 外观 / 数据源模式）

/// 应用级设置，@Observable 注入环境
@MainActor
@Observable
final class SettingsStore {
    private enum Key {
        static let remoteBaseURL = "hb.remoteBaseURL"
        static let colorScheme = "hb.colorScheme"
    }

    /// 远程 FastAPI 地址（如 http://192.168.1.5:8010）；nil = 仅离线快照
    var remoteBaseURL: URL? {
        didSet { UserDefaults.standard.set(remoteBaseURL?.absoluteString, forKey: Key.remoteBaseURL) }
    }

    /// 外观：跟随系统 / 浅色 / 深色
    var colorScheme: ColorSchemePreference {
        didSet { UserDefaults.standard.set(colorScheme.rawValue, forKey: Key.colorScheme) }
    }

    /// 数据源模式描述（设置页展示）
    var modeDescription: String {
        if let url = remoteBaseURL { return "远程 + 快照回退\n\(url.absoluteString)" }
        return "仅离线快照\n（设置远程地址后启用实时/AI）"
    }

    init() {
        let defaults = UserDefaults.standard
        if let raw = defaults.string(forKey: Key.remoteBaseURL), let url = URL(string: raw) {
            self.remoteBaseURL = url
        } else {
            self.remoteBaseURL = nil
        }
        self.colorScheme = ColorSchemePreference(rawValue: defaults.string(forKey: Key.colorScheme) ?? "system") ?? .system
    }
}

enum ColorSchemePreference: String, Sendable {
    case system, light, dark
}

// MARK: - 收藏（轻量持久化）

/// 收藏的歌曲（本地持久化，符合 Web 端收藏语义）
@MainActor
@Observable
final class FavoritesStore {
    struct Favorite: Codable, Identifiable, Sendable, Hashable {
        let bvid: String
        let title: String
        var note: String?
        var addedAt: Date
        var id: String { bvid }
    }

    private(set) var items: [Favorite] = []
    private let storageKey = "hb.favorites.v1"

    init() {
        load()
    }

    func toggle(_ entry: RankEntry) {
        if let idx = items.firstIndex(where: { $0.bvid == entry.bvid }) {
            items.remove(at: idx)
        } else {
            items.insert(Favorite(bvid: entry.bvid, title: entry.displayTitle, addedAt: Date()), at: 0)
        }
        persist()
        Haptics.selection()
    }

    func remove(_ bvid: String) {
        items.removeAll { $0.bvid == bvid }
        persist()
    }

    func isFavorite(_ bvid: String) -> Bool {
        items.contains { $0.bvid == bvid }
    }

    func setNote(_ bvid: String, _ note: String?) {
        guard let idx = items.firstIndex(where: { $0.bvid == bvid }) else { return }
        items[idx].note = note
        persist()
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }
        items = (try? JSONDecoder().decode([Favorite].self, from: data)) ?? []
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}