import Foundation

// MARK: - 通用名字/参与人（producers / vocalists 对象数组）

struct Person: Codable, Sendable, Hashable {
    let name: String?
}

// MARK: - 歌曲条目（搜索结果 / 收藏通用）

/// 歌曲条目：覆盖 /api/songs/search 与榜单行扩展字段，全部容错解码
struct SongItem: Codable, Identifiable, Sendable, Hashable {
    let bvid: String
    let title: String
    var titleCn: String?
    var view: Int
    var favorite: Int
    var coin: Int
    var like: Int
    var share: Int
    var score: Double?
    var pubtime: Int?
    var bestRank: Int?
    var weeksOnBoard: Int?
    var peakRank: Int?
    var tier: String?
    var producers: [Person]?
    var vocalists: [Person]?

    var id: String { bvid }
    var displayTitle: String {
        if let titleCn, !titleCn.isEmpty { return titleCn }
        return title
    }
    var producerNames: String { (producers ?? []).compactMap(\.name).joined(separator: " / ") }
    var vocalistNames: String { (vocalists ?? []).compactMap(\.name).joined(separator: " / ") }

    enum CodingKeys: String, CodingKey {
        case bvid, title, view, favorite, coin, like, share, score, pubtime, tier
        case titleCn = "title_cn"
        case bestRank = "best_rank"
        case weeksOnBoard = "weeks_on_board"
        case peakRank = "peak_rank"
        case producers, vocalists
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bvid = try c.decodeIfPresent(String.self, forKey: .bvid) ?? ""
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        titleCn = try c.decodeIfPresent(String.self, forKey: .titleCn)
        view = try c.decodeIfPresent(Int.self, forKey: .view) ?? 0
        favorite = try c.decodeIfPresent(Int.self, forKey: .favorite) ?? 0
        coin = try c.decodeIfPresent(Int.self, forKey: .coin) ?? 0
        like = try c.decodeIfPresent(Int.self, forKey: .like) ?? 0
        share = try c.decodeIfPresent(Int.self, forKey: .share) ?? 0
        score = try c.decodeIfPresent(Double.self, forKey: .score)
        pubtime = try c.decodeIfPresent(Int.self, forKey: .pubtime)
        bestRank = try c.decodeIfPresent(Int.self, forKey: .bestRank)
        weeksOnBoard = try c.decodeIfPresent(Int.self, forKey: .weeksOnBoard)
        peakRank = try c.decodeIfPresent(Int.self, forKey: .peakRank)
        tier = try c.decodeIfPresent(String.self, forKey: .tier)
        producers = try c.decodeIfPresent([Person].self, forKey: .producers)
        vocalists = try c.decodeIfPresent([Person].self, forKey: .vocalists)
    }

    init(bvid: String, title: String, titleCn: String?, view: Int, favorite: Int,
         coin: Int, like: Int, share: Int, score: Double?, pubtime: Int?) {
        self.bvid = bvid
        self.title = title
        self.titleCn = titleCn
        self.view = view
        self.favorite = favorite
        self.coin = coin
        self.like = like
        self.share = share
        self.score = score
        self.pubtime = pubtime
    }
}

// MARK: - 歌曲历史（all-history 条目）

struct SongHistoryEntry: Codable, Identifiable, Sendable, Hashable {
    let boardType: String?
    let issue: String?
    let rank: Int?
    let score: Double?
    let view: Int?
    let favorite: Int?
    let coin: Int?
    let like: Int?

    var id: String { "\(boardType ?? "?")-\(issue ?? "?")" }
    var boardLabel: String {
        switch boardType {
        case "weekly": return "周榜"
        case "legend": return "传说曲"
        case "annual": return "年榜"
        default: return boardType ?? "?"
        }
    }

    enum CodingKeys: String, CodingKey {
        case boardType = "board_type", issue, rank, score, view, favorite, coin, like
    }
}

// MARK: - 歌曲详情（/api/songs/{bvid}）

struct SongDetail: Codable, Sendable {
    let bvid: String?
    let title: String?
    let titleCn: String?
    let view: Int?
    let favorite: Int?
    let coin: Int?
    let like: Int?
    let share: Int?
    let pubtime: Int?
    let tier: String?
    let weeksOnBoard: Int?
    let bestRank: Int?
    let producers: [Person]?
    let vocalists: [Person]?

    enum CodingKeys: String, CodingKey {
        case bvid, title, view, favorite, coin, like, share, pubtime, tier
        case titleCn = "title_cn"
        case weeksOnBoard = "weeks_on_board"
        case bestRank = "best_rank"
        case producers, vocalists
    }
}

// MARK: - 统计：P主 / 歌姬

struct StatsPerson: Codable, Identifiable, Sendable, Hashable {
    let name: String
    let songCount: Int?
    let totalView: Int64?
    let totalFavorite: Int64?
    let totalCoin: Int64?
    let totalLike: Int64?
    let legendCount: Int?
    let mythCount: Int?
    let bestRank: Int?
    let topSongs: [SongItem]?

    var id: String { name }

    enum CodingKeys: String, CodingKey {
        case name
        case songCount = "song_count"
        case totalView = "total_view"
        case totalFavorite = "total_favorite"
        case totalCoin = "total_coin"
        case totalLike = "total_like"
        case legendCount = "legend_count"
        case mythCount = "myth_count"
        case bestRank = "best_rank"
        case topSongs = "top_songs"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        songCount = try c.decodeIfPresent(Int.self, forKey: .songCount)
        totalView = try c.decodeIfPresent(Int64.self, forKey: .totalView)
        totalFavorite = try c.decodeIfPresent(Int64.self, forKey: .totalFavorite)
        totalCoin = try c.decodeIfPresent(Int64.self, forKey: .totalCoin)
        totalLike = try c.decodeIfPresent(Int64.self, forKey: .totalLike)
        legendCount = try c.decodeIfPresent(Int.self, forKey: .legendCount)
        mythCount = try c.decodeIfPresent(Int.self, forKey: .mythCount)
        bestRank = try c.decodeIfPresent(Int.self, forKey: .bestRank)
        topSongs = try c.decodeIfPresent([SongItem].self, forKey: .topSongs)
    }
}

// MARK: - Hot 实时热度

struct HeatItem: Codable, Identifiable, Sendable, Hashable {
    let bvid: String?
    let title: String?
    let rank: Int?
    let view: Int?
    let momentum: Double?
    let deltaView: Int?
    let issuesOnBoard: Int?

    var id: String { bvid ?? UUID().uuidString }

    enum CodingKeys: String, CodingKey {
        case bvid, title, rank, view, momentum
        case deltaView = "delta_view"
        case issuesOnBoard = "issues_on_board"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bvid = try c.decodeIfPresent(String.self, forKey: .bvid)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        rank = try c.decodeIfPresent(Int.self, forKey: .rank)
        view = try c.decodeIfPresent(Int.self, forKey: .view)
        momentum = try c.decodeIfPresent(Double.self, forKey: .momentum)
        deltaView = try c.decodeIfPresent(Int.self, forKey: .deltaView)
        issuesOnBoard = try c.decodeIfPresent(Int.self, forKey: .issuesOnBoard)
    }
}

// MARK: - 下期预测

struct PredictResult: Codable, Sendable {
    let cutline: PredictCutline?
    let entries: [PredictEntry]?
}

struct PredictCutline: Codable, Sendable {
    let history: [CutlinePoint]?
    let predicted: Double?
}

struct CutlinePoint: Codable, Identifiable, Sendable, Hashable {
    let issue: String?
    let cut: Double?
    let top: Double?

    var id: String { issue ?? UUID().uuidString }
}

struct PredictEntry: Codable, Identifiable, Sendable, Hashable {
    let bvid: String?
    let title: String?
    let view: Int?
    let momentum: Double?
    let projectedScore: Double?

    var id: String { bvid ?? UUID().uuidString }

    enum CodingKeys: String, CodingKey {
        case bvid, title, view, momentum
        case projectedScore = "projected_score"
    }
}

// MARK: - 洞察/分析师

struct InsightOverview: Codable, Sendable {
    let freshness: InsightFreshness?
    let kpis: InsightKPIs?
}

struct InsightFreshness: Codable, Sendable {
    let latestWeeklyIssue: String?
    let ageDays: Int?
    let stale: Bool?

    enum CodingKeys: String, CodingKey {
        case latestWeeklyIssue = "latest_weekly_issue"
        case ageDays = "age_days"
        case stale
    }
}

struct InsightKPIs: Codable, Sendable {
    let songsTotal: Int?
    let boardCount: Int?

    enum CodingKeys: String, CodingKey {
        case songsTotal = "songs_total"
        case boardCount = "board_count"
    }
}

// MARK: - 网易云

struct NeteaseSong: Codable, Identifiable, Sendable, Hashable {
    let id: Int?
    let name: String?
    let artists: String?
    let album: String?
    let pic: String?
    let duration: Int?

    var idValue: String { id.map(String.init) ?? UUID().uuidString }
    var idString: String { id.map(String.init) ?? "" }

    enum CodingKeys: String, CodingKey {
        case id, name, artists, album, pic, duration
        case durationMs = "duration_ms"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(Int.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        artists = try c.decodeIfPresent(String.self, forKey: .artists)
        album = try c.decodeIfPresent(String.self, forKey: .album)
        pic = try c.decodeIfPresent(String.self, forKey: .pic)
        duration = try c.decodeIfPresent(Int.self, forKey: .duration) ?? try c.decodeIfPresent(Int.self, forKey: .durationMs)
    }
}

struct NeteaseSongURL: Codable, Sendable {
    let url: String?
    let vip: Bool?
}

struct NeteaseLyric: Codable, Sendable {
    let lyric: String?
}

// MARK: - 月榜/日榜（复用 BoardSnapshot 结构，远程拉取）

struct MonthDailyIssuesResponse: Decodable, Sendable {
    let issues: [BoardIssue]?
}

struct MonthDailyRankingsResponse: Decodable, Sendable {
    let issue: String?
    let items: [RankEntry]?
}