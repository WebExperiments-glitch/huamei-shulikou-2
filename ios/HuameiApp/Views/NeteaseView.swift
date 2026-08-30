import SwiftUI
import AVFoundation
import Observation

// MARK: - 网易云（搜索 / 播放 / 歌词）

struct NeteaseView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var results: [NeteaseSong] = []
    @State private var query = ""
    @State private var searched = false

    var body: some View {
        List {
            if settings.remoteBaseURL == nil {
                ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark", description: Text("在「设置」中填写远程地址后可搜索/播放网易云"))
            } else if results.isEmpty {
                ContentUnavailableView(
                    "搜索网易云歌曲",
                    systemImage: "music.note",
                    description: Text(searched ? "没有找到相关歌曲" : "输入歌名开始搜索，点击歌曲进入 3D 可视化听音")
                )
            } else {
                ForEach(results) { song in
                    NavigationLink(value: song) {
                        HStack(spacing: 12) {
                            AsyncImage(url: URL(string: song.pic ?? "")) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                Color(.secondarySystemFill)
                            }
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                            VStack(alignment: .leading, spacing: 3) {
                                Text(song.name ?? "")
                                    .font(.body.weight(.medium))
                                    .lineLimit(1)
                                Text([song.artists, song.album].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(.textTertiary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Image(systemName: "cube.transparent")
                                .font(.caption)
                                .foregroundStyle(.textTertiary)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
        }
        .navigationTitle("网易云")
        .searchable(text: $query, prompt: "歌名 / 歌手 / 专辑")
        .navigationDestination(for: NeteaseSong.self) { song in
            MusicVisualizerView(song: song)
        }
        .task(id: query) {
            try? await Task.sleep(nanoseconds: 400_000_000)
            await search()
        }
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { results = []; searched = false; return }
        results = await RemoteAPI.neteaseSearch(q, settings: settings)
        searched = true
    }
}

// MARK: - 播放器

@MainActor
@Observable
final class NeteasePlayer {
    private var player: AVPlayer?
    private var timeObserver: Any?
    var currentSong: NeteaseSong?
    var currentSongID = ""
    var isPlaying = false
    var currentTime: Double = 0
    var duration: Double = 0
    var lyric: [(time: Double, text: String)] = []

    func play(_ song: NeteaseSong, settings: SettingsStore) {
        currentSong = song
        currentSongID = song.idString
        stopObserver()
        Task {
            guard let result = await RemoteAPI.neteaseSongURL(songID: song.idString, settings: settings),
                  let urlString = result.url, let url = URL(string: urlString) else {
                currentSong = nil
                currentSongID = ""
                return
            }
            let item = AVPlayerItem(url: url)
            player = AVPlayer(playerItem: item)
            player?.play()
            isPlaying = true
            setupObserver(item)
            await loadLyric(songID: song.idString, settings: settings)
        }
    }

    func toggle() {
        guard let player else { return }
        if player.timeControlStatus == .playing {
            player.pause()
            isPlaying = false
        } else {
            player.play()
            isPlaying = true
        }
    }

    func seek(to time: Double) {
        player?.seek(to: CMTime(seconds: time, preferredTimescale: 1000))
    }

    /// 停止并释放播放器（离开页面时调用）
    func clear() {
        stopObserver()
        player?.pause()
        player = nil
        isPlaying = false
        currentTime = 0
        duration = 0
        lyric = []
    }

    private func loadLyric(songID: String, settings: SettingsStore) async {
        let raw = await RemoteAPI.neteaseLyric(songID: songID, settings: settings) ?? ""
        lyric = LyricsParser.parse(raw)
    }

    private func setupObserver(_ item: AVPlayerItem) {
        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                self?.currentTime = time.seconds
            }
        }
        Task { @MainActor in
            let d = try? await item.asset.load(.duration)
            self.duration = d?.seconds ?? 0
        }
    }

    private func stopObserver() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
    }
}

// MARK: - LRC 解析

enum LyricsParser {
    static func parse(_ raw: String) -> [(time: Double, text: String)] {
        var out: [(time: Double, text: String)] = []
        let pattern = #"\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]"#
        for line in raw.split(separator: "\n") {
            let str = String(line)
            guard let range = str.range(of: #"\[[\d:.]+\]"#, options: .regularExpression) else { continue }
            let times = str.matches(pattern)
            let text = String(str[range.upperBound...]).trimmingCharacters(in: .whitespaces)
            for t in times {
                let sec = Double(t.0) * 60 + t.1 + t.2
                out.append((sec, text.isEmpty ? "♪" : text))
            }
        }
        return out.sorted { lhs, rhs in lhs.time < rhs.time }
    }
}

extension String {
    /// 匹配所有 [mm:ss.xx] 时间标签，返回 [(分, 秒, 秒小数)]
    func matches(_ pattern: String) -> [(Int, Double, Double)] {
        var result: [(Int, Double, Double)] = []
        let regex = try? NSRegularExpression(pattern: pattern)
        let ns = self as NSString
        let range = NSRange(location: 0, length: ns.length)
        regex?.enumerateMatches(in: self, options: [], range: range) { m, _, _ in
            guard let m, m.numberOfRanges == 4,
                  let mStr = Range(m.range(at: 1), in: self),
                  let sStr = Range(m.range(at: 2), in: self) else { return }
            let min = Int(self[mStr]) ?? 0
            let sec = Double(self[sStr]) ?? 0
            let frac: Double
            if m.range(at: 3).location != NSNotFound, let f = Range(m.range(at: 3), in: self) {
                let fStr = self[f]
                frac = Double("0.\(fStr)") ?? 0
            } else {
                frac = 0
            }
            result.append((min, sec, frac))
        }
        return result
    }
}