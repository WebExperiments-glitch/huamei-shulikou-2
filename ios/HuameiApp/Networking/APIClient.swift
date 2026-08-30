import Foundation

/// 结构化 API 错误（status=0 表示网络层失败：无法连接/超时/断网）
struct ApiError: Error, Sendable {
    let status: Int
    let path: String
    let detail: String?

    var isNetworkFailure: Bool { status == 0 }

    var localizedDescription: String {
        if isNetworkFailure { return "无法连接服务（检查网络或远程地址设置）" }
        return detail?.isEmpty == false ? detail! : "请求失败（HTTP \(status)）"
    }
}

// MARK: - 远程数据源（可配置 FastAPI）

/// 轻量 HTTP 客户端：URLSession async/await，超时 + 可取消
struct APIClient: Sendable {
    static let shared = APIClient()
    private let session: URLSession
    private let timeout: TimeInterval

    init(timeout: TimeInterval = 20) {
        self.timeout = timeout
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    /// GET 解码为 T；baseURL 为空返回网络失败
    func get<T: Decodable>(_ path: String, baseURL: URL, data: Data? = nil) async throws -> T {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if let data, let json = try? JSONSerialization.jsonObject(with: data), let obj = json as? [String: Any] {
            comps?.queryItems = obj.map { URLQueryItem(name: $0.key, value: "\($0.value)") }
        }
        guard let url = comps?.url else {
            throw ApiError(status: 0, path: path, detail: "URL 构造失败")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(request, path: path)
    }

    /// 直接用完整 URL 发起 GET（用于带 query 的复杂请求）
    func getURL<T: Decodable>(from url: URL) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(request, path: url.path)
    }

    /// POST JSON 并解码响应
    func post<T: Decodable>(_ path: String, body: Data?, baseURL: URL) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = body
        return try await perform(request, path: path)
    }

    /// 统一执行 + 错误归一
    private func perform<T: Decodable>(_ request: URLRequest, path: String) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw ApiError(status: 0, path: path, detail: "非 HTTP 响应")
            }
            guard (200..<300).contains(http.statusCode) else {
                let detail = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.detail
                throw ApiError(status: http.statusCode, path: path, detail: detail)
            }
            return try JSONDecoder().decode(T.self, from: data)
        } catch let err as ApiError {
            throw err
        } catch {
            throw ApiError(status: 0, path: path, detail: error.localizedDescription)
        }
    }

    /// 简单返回原始数据（如二进制/图片/文本）
    func rawGet(_ path: String, baseURL: URL) async throws -> Data {
        let url = baseURL.appendingPathComponent(path)
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ApiError(status: 0, path: path, detail: "下载失败")
        }
        return data
    }

    private struct ErrorBody: Decodable { let detail: String? }
}