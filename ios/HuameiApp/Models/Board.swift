import Foundation

// MARK: - 榜单类型

/// 榜单类型，与后端 /api/boards 对齐
enum BoardType: String, Codable, CaseIterable, Identifiable, Sendable {
    case weekly
    case legend
    case annual
    case monthly
    case daily

    var id: String { rawValue }

    var title: String {
        switch self {
        case .weekly: return "周榜"
        case .legend: return "传说曲"
        case .annual: return "年榜"
        case .monthly: return "月榜"
        case .daily: return "日榜"
        }
    }

    var systemImage: String {
        switch self {
        case .weekly: return "chart.line.uptrend.xyaxis"
        case .legend: return "trophy.fill"
        case .annual: return "calendar"
        case .monthly: return "chart.bar.fill"
        case .daily: return "sun.max.fill"
        }
    }

    /// 后端板块是否在离线快照中存在
    var snapshotKey: String { rawValue }
}

// MARK: - 期次

/// 一期榜单（issue 为 YYYYMMDD 形字符串）
struct BoardIssue: Codable, Identifiable, Sendable, Hashable {
    let issue: String
    let date: String?
    let entries: Int?
    let isAnnual: Int?

    var id: String { issue }

    /// 展示用日期（2026-08-17 → 8月17日）
    var displayDate: String {
        guard issue.count == 8 else { return issue }
        let m = Int(issue.prefix(4)) ?? 0
        let day = Int(issue.suffix(2)) ?? 0
        return "\(m)月\(day)日"
    }
}

// MARK: - 榜单条目

/// 榜单行，字段与后端 rankings 返回对齐（缺字段容错解码：后端精简快照可缺少互动指标）
struct RankEntry: Codable, Identifiable, Sendable, Hashable {
    let rank: Int
    let bvid: String
    var title: String
    var titleCn: String?
    var view: Int
    var favorite: Int
    var coin: Int
    var like: Int
    var share: Int
    var score: Double?
    var pubtime: Int?
    var bestRank: Int?
    var producers: [String]?

    var id: String { bvid }

    var displayTitle: String {
        if let titleCn, !titleCn.isEmpty { return titleCn }
        return title
    }
    var displayScore: String {
        guard let score else { return "—" }
        if score > 1000 { return String(format: "%.1fk", score / 1000) }
        return String(format: "%.0f", score)
    }

    enum CodingKeys: String, CodingKey {
        case rank, bvid, title
        case titleCn = "title_cn"
        case view, favorite, coin, like, share, score, pubtime
        case bestRank = "best_rank"
        case producers
    }

    /// 容错解码：互动指标缺失时按 0 处理，任何单行缺字段都不应导致整份快照解码失败
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rank = try c.decode(Int.self, forKey: .rank)
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
        producers = try c.decodeIfPresent([String].self, forKey: .producers)
    }
}

// MARK: - 快照容器

/// 内置离线快照：与后端结构一致，App 冷启动即可读榜单
struct SnapshotData: Codable, Sendable {
    let generatedAt: String
    let appVersion: String
    /// key = BoardType.snapshotKey；value 为该榜的期次 + 各期排名
    var boards: [String: BoardSnapshot]

    /// 取某类型榜单快照；缺失时返回空快照（由远程补）
    func board(_ type: BoardType) -> BoardSnapshot {
        boards[type.snapshotKey] ?? BoardSnapshot(issues: [], rankings: [:])
    }
}

struct BoardSnapshot: Codable, Sendable {
    var issues: [BoardIssue]
    var rankings: [String: [RankEntry]]
}