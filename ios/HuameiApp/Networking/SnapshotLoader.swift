import Foundation

/// 内置离线快照加载器
enum SnapshotLoader {
    /// 从 App Bundle 加载 snapshot.json；缺失/损坏返回 nil（调用方回退远程或显示空态）
    static func loadFromBundle(named resource: String = "snapshot") -> SnapshotData? {
        guard let url = Bundle.main.url(forResource: resource, withExtension: "json") else {
            return nil
        }
        return load(from: url)
    }

    /// 从任意 URL（文件）加载快照
    static func load(from url: URL) -> SnapshotData? {
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            return try decoder.decode(SnapshotData.self, from: data)
        } catch {
            // 快照异常不崩 App：静默降级为空快照，后续由远程补齐/展示空态
            #if DEBUG
            print("⚠️ [Snapshot] 快照解析失败（已降级为离线空态）: \(error)")
            #endif
            return nil
        }
    }
}

// MARK: - 远程榜单接口（与 /api/boards 对齐）

/// 远程响应容器
struct IssuesResponse: Decodable, Sendable {
    let boardType: String?
    let issues: [BoardIssue]?
}

struct RankingsResponse: Decodable, Sendable {
    let issue: String?
    let items: [RankEntry]?
}

/// 榜单数据仓库：优先远程实时，快照兜底
@MainActor
@Observable
final class BoardRepository {
    var snapshot: SnapshotData?

    init() {
        self.snapshot = SnapshotLoader.loadFromBundle()
    }

    /// 本地快照期次列表
    func localIssues(_ type: BoardType) -> [BoardIssue] {
        snapshot?.board(type).issues ?? []
    }

    /// 本地快照某期排名
    func localRankings(_ type: BoardType, issue: String) -> [RankEntry] {
        snapshot?.board(type).rankings[issue] ?? []
    }

    /// 从远程拉某类型期次列表（settings.remoteBaseURL 未配置时返回 nil）
    func remoteIssues(_ type: BoardType, using settings: SettingsStore) async -> [BoardIssue]? {
        guard let base = settings.remoteBaseURL else { return nil }
        do {
            let resp: IssuesResponse = try await APIClient.shared.get(
                "api/boards/\(type.rawValue)/issues", baseURL: base
            )
            return resp.issues
        } catch {
            return nil
        }
    }

    /// 从远程拉某期排名明细
    func remoteRankings(_ type: BoardType, issue: String, using settings: SettingsStore) async -> [RankEntry]? {
        guard let base = settings.remoteBaseURL else { return nil }
        do {
            let resp: RankingsResponse = try await APIClient.shared.get(
                "api/boards/\(type.rawValue)/issues/\(issue)/rankings?top=100", baseURL: base
            )
            return resp.items
        } catch {
            return nil
        }
    }

    /// 尝试用远程数据刷新某类型的期次列表（仅当远程可用且非空时覆盖）
    func refreshIssues(_ type: BoardType, using settings: SettingsStore) async {
        guard let remote = await remoteIssues(type, using: settings), !remote.isEmpty else { return }
        var snap = snapshot ?? SnapshotData(generatedAt: "", appVersion: "", boards: [:])
        var board = snap.board(type)
        board.issues = remote
        snap.boards[type.snapshotKey] = board
        snapshot = snap
    }

    /// 尝试用远程数据刷新某期的排名（仅当远程可用且非空时覆盖）
    func refreshRankings(_ type: BoardType, issue: String, using settings: SettingsStore) async {
        guard let remote = await remoteRankings(type, issue: issue, using: settings),
              !remote.isEmpty else { return }
        var snap = snapshot ?? SnapshotData(generatedAt: "", appVersion: "", boards: [:])
        var board = snap.board(type)
        board.rankings[issue] = remote
        snap.boards[type.snapshotKey] = board
        snapshot = snap
    }
}