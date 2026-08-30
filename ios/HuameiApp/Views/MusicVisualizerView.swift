import SwiftUI

// MARK: - 3D 可视化听音页（点网易云歌曲进入）
// 全屏液态玻璃 3D 场景 + 播放控制 + 歌词滚动，音乐可视化一体化

struct MusicVisualizerView: View {
    let song: NeteaseSong
    @Environment(SettingsStore.self) private var settings
    @State private var player = NeteasePlayer()
    @State private var mode: RenderMode = .balanced

    var body: some View {
        ZStack {
            // 3D 场景层
            Scene3DView(mode: mode)
                .ignoresSafeArea()

            // 底部控制层（半透明玻璃，不挡 3D 主体）
            VStack {
                Spacer()
                controlCard
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .background(
            LinearGradient(
                colors: [Color.appBackground, Color.brandPrimary.opacity(0.14)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(song.name ?? "音乐可视")
                    .font(.headline)
                    .lineLimit(1)
            }
        }
        .safeAreaInset(edge: .top) {
            Picker("渲染模式", selection: $mode) {
                ForEach(RenderMode.allCases) { m in
                    Label(m.label, systemImage: m.icon).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .background(.ultraThinMaterial)
        }
        .task { await begin() }
        .onChange(of: player.isPlaying) { _, playing in
            AudioVisualFeedback.shared.playing = playing
        }
        .onChange(of: player.currentTime) { _, _ in
            AudioVisualFeedback.shared.tick()
        }
        .onDisappear {
            player.clear()
            AudioVisualFeedback.shared.playing = false
            AudioVisualFeedback.shared.energy = 0
        }
    }

    private func begin() async {
        guard settings.remoteBaseURL != nil else { return }
        player.play(song, settings: settings)
    }

    // MARK: - 底部控制（复用播放条 + 歌词）

    private var controlCard: some View {
        VStack(spacing: 8) {
            // 播放/暂停 + 歌名歌手
            HStack(spacing: 12) {
                Button {
                    player.toggle()
                } label: {
                    Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(Color.brandPrimary)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(song.name ?? "")
                        .font(.headline)
                        .lineLimit(1)
                    Text([song.artists, song.album].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.textTertiary)
                        .lineLimit(1)
                }
                Spacer()
                Text(playerDurationText)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.textTertiary)
            }

            // 歌词滚动
            if !player.lyric.isEmpty {
                LyricsScrollable(lyric: player.lyric, currentTime: player.currentTime)
                    .frame(height: 104)
            }

            // 进度条
            Slider(value: Binding(
                get: { player.currentTime },
                set: { player.seek(to: $0) }
            ), in: 0...max(player.duration, 1))
            .tint(.brandPrimary)
        }
        .padding(14)
        .background(.cardSurface.opacity(0.35))
        .glassEffect(in: .rect(cornerRadius: 22))
    }

    private var playerDurationText: String {
        let fmt = { (s: Double) -> String in
            let m = Int(s) / 60
            let sec = Int(s) % 60
            return String(format: "%d:%02d", m, sec)
        }
        return "\(fmt(player.currentTime)) / \(fmt(player.duration))"
    }
}

// MARK: - 歌词滚动（按当前时间高亮）

struct LyricsScrollable: View {
    let lyric: [(time: Double, text: String)]
    let currentTime: Double

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical) {
                LazyVStack(spacing: 6) {
                    ForEach(Array(lyric.enumerated()), id: \.offset) { idx, line in
                        Text(line.text)
                            .font(.caption)
                            .foregroundStyle(isCurrent(idx) ? Color.brandPrimary : Color.textTertiary)
                            .fontWeight(isCurrent(idx) ? .bold : .regular)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(idx)
                    }
                }
            }
            .onChange(of: currentTime) { _, _ in
                if let i = lyric.lastIndex(where: { $0.time <= currentTime }) {
                    withAnimation { proxy.scrollTo(i, anchor: .center) }
                }
            }
        }
    }

    private func isCurrent(_ idx: Int) -> Bool {
        guard idx < lyric.count else { return false }
        let line = lyric[idx]
        if idx + 1 < lyric.count {
            return currentTime >= line.time && currentTime < lyric[idx + 1].time
        }
        return currentTime >= line.time
    }
}