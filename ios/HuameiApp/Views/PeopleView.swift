import SwiftUI

// MARK: - P主 / 歌姬榜（列表 + 详情）

struct PeopleView: View {
    let role: PersonRole
    @Environment(SettingsStore.self) private var settings
    @State private var people: [StatsPerson] = []
    @State private var loaded = false

    var body: some View {
        List {
            if people.isEmpty {
                if settings.remoteBaseURL == nil {
                    ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark",
                                           description: Text("在「设置」中填写远程地址后可查看 \(role.title) 榜"))
                } else {
                    ContentUnavailableView("暂无数据", systemImage: "person.2", description: Text("遥感数据暂不可用"))
                }
            } else {
                ForEach(people) { p in
                    NavigationLink(value: p.name) {
                        PersonRow(person: p)
                    }
                }
            }
        }
        .navigationTitle(role.title)
        .navigationDestination(for: String.self) { name in
            PersonDetailView(role: role, name: name)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loaded = true }
        people = await RemoteAPI.stats(role == .producers ? "artists" : "vocalists", settings: settings)
    }
}

enum PersonRole: String, CaseIterable, Identifiable {
    case producers, vocalists
    var id: String { rawValue }
    var title: String { self == .producers ? "P主榜" : "歌姬榜" }
    var systemImage: String { self == .producers ? "person.crop.square" : "music.mic" }
}

struct PersonRow: View {
    let person: StatsPerson

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "person.crop.circle.fill")
                .font(.title2)
                .foregroundStyle(Color.brandPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text(person.name)
                    .font(.body.weight(.medium))
                HStack(spacing: 12) {
                    chip("song", "\(person.songCount ?? 0) 首")
                    chip("play.fill", compact(Int(person.totalView ?? 0)))
                    if let legend = person.legendCount, legend > 0 {
                        chip("trophy.fill", "\(legend) 传说")
                    }
                }
            }
            Spacer()
        }
        .padding(.vertical, 6)
    }

    private func chip(_ image: String, _ text: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: image).font(.caption2)
            Text(text).font(.caption.monospacedDigit())
        }
        .foregroundStyle(.textTertiary)
    }
}

// MARK: - 歌手详情

struct PersonDetailView: View {
    let role: PersonRole
    let name: String
    @Environment(SettingsStore.self) private var settings
    @State private var songs: [SongItem] = []

    var body: some View {
        List {
            if songs.isEmpty {
                if settings.remoteBaseURL == nil {
                    ContentUnavailableView("未配置远程后端", systemImage: "wifi.exclamationmark", description: Text("在「设置」中填写远程地址"))
                } else {
                    ContentUnavailableView("暂无歌曲", systemImage: "music.note", description: Text("该 \(role == .producers ? "P主" : "歌姬") 暂无歌曲数据"))
                }
            } else {
                ForEach(songs) { song in
                    NavigationLink(value: song.bvid) {
                        SongItemRow(song: song)
                    }
                }
            }
        }
        .navigationTitle(name)
        .navigationDestination(for: String.self) { bvid in
            SongDetailView(bvid: bvid)
        }
        .task { await load() }
    }

    private func load() async {
        songs = await RemoteAPI.artistSongs(role: role.rawValue, name: name, settings: settings)
    }
}