import Foundation

/// 远程功能接口全集（依赖「设置」中的远程 FastAPI 地址；未配置时优雅返回空）
enum RemoteAPI {
    // MARK: - 歌曲库

    static func searchSongs(q: String = "", sort: String = "pubtime", order: String = "desc",
                            limit: Int = 50, offset: Int = 0, settings: SettingsStore) async -> [SongItem] {
        guard let base = await settings.remoteBaseURL else { return [] }
        var comps = URLComponents(string: base.appendingPathComponent("api/songs/search").absoluteString)!
        comps.queryItems = [
            .init(name: "q", value: q),
            .init(name: "sort", value: sort),
            .init(name: "order", value: order),
            .init(name: "limit", value: "\(limit)"),
            .init(name: "offset", value: "\(offset)"),
        ]
        guard let full = comps.url else { return [] }
        do {
            struct Box: Decodable { let items: [SongItem]?; let total: Int? }
            let box: Box = try await APIClient.shared.getURL(from: full)
            return box.items ?? []
        } catch {
            print("[RemoteAPI] searchSongs 失败: \(error)")
            return []
        }
    }

    static func song(_ bvid: String, settings: SettingsStore) async -> SongDetail? {
        guard let base = await settings.remoteBaseURL else { return nil }
        do {
            return try await APIClient.shared.get("api/songs/\(bvid)", baseURL: base)
        } catch {
            print("[RemoteAPI] song 失败: \(error)")
            return nil
        }
    }

    static func songHistory(_ bvid: String, settings: SettingsStore) async -> [SongHistoryEntry] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            struct Box: Decodable { let items: [SongHistoryEntry]?; let history: [SongHistoryEntry]? }
            let box: Box = try await APIClient.shared.get("api/songs/\(bvid)/all-history", baseURL: base)
            return box.items ?? box.history ?? []
        } catch {
            print("[RemoteAPI] songHistory 失败: \(error)")
            return []
        }
    }

    // MARK: - P主 / 歌姬

    static func stats(_ role: String, settings: SettingsStore) async -> [StatsPerson] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            struct Box: Decodable { let items: [StatsPerson]?; let artists: [StatsPerson]?; let vocalists: [StatsPerson]? }
            let box: Box = try await APIClient.shared.get("api/stats/\(role)", baseURL: base)
            let raw: [StatsPerson] = role == "vocalists"
                ? (box.vocalists ?? box.items ?? [])
                : (box.artists ?? box.items ?? [])
            // 榜单可能返回数千条，渲染长列表会卡；只取最有价值的前 300
            return Array(raw.prefix(300))
        } catch {
            print("[RemoteAPI] stats 失败: \(error)")
            return []
        }
    }

    static func artistSongs(role: String, name: String, settings: SettingsStore) async -> [SongItem] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            var comps = URLComponents(string: base.appendingPathComponent("api/songs/search").absoluteString)!
            comps.queryItems = [
                .init(name: role, value: name),
                .init(name: "sort", value: "view"),
                .init(name: "limit", value: "50"),
            ]
            guard let full = comps.url else { return [] }
            struct Box: Decodable { let items: [SongItem]? }
            let box: Box = try await APIClient.shared.getURL(from: full)
            return box.items ?? []
        } catch {
            print("[RemoteAPI] artistSongs 失败: \(error)")
            return []
        }
    }

    // MARK: - Hot 实时热度

    static func hotSongs(sort: String = "score", limit: Int = 50, settings: SettingsStore) async -> [HeatItem] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            struct Box: Decodable { let items: [HeatItem]?; let songs: [HeatItem]? }
            let box: Box = try await APIClient.shared.get("api/hot/songs?sort=\(sort)&limit=\(limit)", baseURL: base)
            return box.items ?? box.songs ?? []
        } catch {
            print("[RemoteAPI] hotSongs 失败: \(error)")
            return []
        }
    }

    static func hotMomentum(limit: Int = 20, settings: SettingsStore) async -> [HeatItem] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            struct Box: Decodable { let items: [HeatItem]? }
            let box: Box = try await APIClient.shared.get("api/hot/momentum?limit=\(limit)", baseURL: base)
            return box.items ?? []
        } catch {
            print("[RemoteAPI] hotMomentum 失败: \(error)")
            return []
        }
    }

    // MARK: - 预测

    static func predict(settings: SettingsStore) async -> PredictResult? {
        guard let base = await settings.remoteBaseURL else { return nil }
        do {
            return try await APIClient.shared.get("api/predict/next-week?board=weekly", baseURL: base)
        } catch {
            print("[RemoteAPI] predict 失败: \(error)")
            return nil
        }
    }

    // MARK: - 洞察

    static func insights(settings: SettingsStore) async -> InsightOverview? {
        guard let base = await settings.remoteBaseURL else { return nil }
        do {
            return try await APIClient.shared.get("api/insights/overview", baseURL: base)
        } catch {
            print("[RemoteAPI] insights 失败: \(error)")
            return nil
        }
    }

    // MARK: - 网易云

    static func neteaseSearch(_ q: String, settings: SettingsStore) async -> [NeteaseSong] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            struct Box: Decodable { let items: [NeteaseSong]?; let songs: [NeteaseSong]? }
            struct Req: Encodable { let keyword: String; let limit: Int }
            let body = try JSONEncoder().encode(Req(keyword: q, limit: 20))
            let box: Box = try await APIClient.shared.post("api/netease/search", body: body, baseURL: base)
            return box.items ?? box.songs ?? []
        } catch {
            print("[RemoteAPI] neteaseSearch 失败: \(error)")
            return []
        }
    }

    static func neteaseSongURL(songID: String, settings: SettingsStore) async -> NeteaseSongURL? {
        guard let base = await settings.remoteBaseURL else { return nil }
        do {
            struct Req: Encodable { let id: String }
            let body = try JSONEncoder().encode(Req(id: songID))
            return try await APIClient.shared.post("api/netease/url", body: body, baseURL: base)
        } catch {
            print("[RemoteAPI] neteaseSongURL 失败: \(error)")
            return nil
        }
    }

    static func neteaseLyric(songID: String, settings: SettingsStore) async -> String? {
        guard let base = await settings.remoteBaseURL else { return nil }
        do {
            struct Req: Encodable { let id: String }
            let body = try JSONEncoder().encode(Req(id: songID))
            let lyric: NeteaseLyric = try await APIClient.shared.post("api/netease/lyric", body: body, baseURL: base)
            return lyric.lyric
        } catch {
            print("[RemoteAPI] neteaseLyric 失败: \(error)")
            return nil
        }
    }

    // MARK: - 月榜 / 日榜

    static func monthDailyIssues(_ path: String, settings: SettingsStore) async -> [BoardIssue] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            let box: MonthDailyIssuesResponse = try await APIClient.shared.get("api/\(path)/issues", baseURL: base)
            return box.issues ?? []
        } catch {
            print("[RemoteAPI] \(path) issues 失败: \(error)")
            return []
        }
    }

    static func monthDailyRankings(_ path: String, issue: String, settings: SettingsStore) async -> [RankEntry] {
        guard let base = await settings.remoteBaseURL else { return [] }
        do {
            let box: MonthDailyRankingsResponse = try await APIClient.shared.get("api/\(path)/issues/\(issue)/rankings?top=100", baseURL: base)
            return box.items ?? []
        } catch {
            print("[RemoteAPI] \(path) rankings 失败: \(error)")
            return []
        }
    }
}