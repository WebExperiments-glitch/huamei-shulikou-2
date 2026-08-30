import SwiftUI
import SceneKit
import Observation

// MARK: - 音乐可视化共享反馈（伪频谱：播放时驱动地形/方块/波纹）
// 网页端用真实 FFT 频段；iOS 端用播放节律合成 energy/kick，驱动同款反应堆地形。

@Observable
final class AudioVisualFeedback {
    static let shared = AudioVisualFeedback()

    var energy: Double = 0      // 0...1 总体能量
    var kick: Double = 0        // 0...1 鼓点脉冲
    var playing = false

    private var lastTick = Date()
    private var phase = 0.0

    /// 每次播放进度更新时调用（MusicVisualizer onTick）
    func tick() {
        let now = Date()
        let dt = min(max(now.timeIntervalSince(lastTick), 0.001), 0.25)
        lastTick = now
        guard playing else {
            phase = 0
            energy *= 0.92
            kick *= 0.8
            return
        }
        phase += dt
        // 伪节律：基础呼吸 + 随机跌宕 + 模拟鼓点
        let breathe = (sin(phase * 2.2) + 1) / 2
        let pulse = (sin(phase * 6.283) + 1) / 2
        let targetEnergy = max(0.18, breathe * 0.6)
        energy += (targetEnergy - energy) * 0.35
        if pulse > 0.97 {
            kick = 1.0
        }
        kick *= 0.86
    }

    /// 简化：本 tick 应使用的高度起伏基准值
    var wave: Double { 0.5 + 0.5 * sin(phase * 1.7) }
    var bounce: Double { 0.35 + kick * 1.4 }
}

// MARK: - 三档渲染模式

enum RenderMode: String, CaseIterable, Identifiable {
    case quality, balanced, performance

    var id: String { rawValue }
    var label: String {
        switch self {
        case .quality: return "画质优先"
        case .balanced: return "普通模式"
        case .performance: return "性能模式"
        }
    }
    var icon: String {
        switch self {
        case .quality: return "sparkles.tv"
        case .balanced: return "slider.horizontal.3"
        case .performance: return "bolt.fill"
        }
    }

    var framesPerSecond: Int { self == .performance ? 30 : 60 }
    var antialiasing: SCNAntialiasingMode {
        switch self {
        case .quality: return .multisampling4X
        case .balanced: return .multisampling2X
        case .performance: return .none
        }
    }
    /// 地形阵列边长（性能模式降密）
    var gridSide: Int {
        switch self {
        case .quality: return 26
        case .balanced: return 22
        case .performance: return 16
        }
    }
    var gridSpacing: Float { self == .performance ? 2.1 : 1.8 }
    var floatingBlocks: Int {
        switch self {
        case .quality: return 46
        case .balanced: return 32
        case .performance: return 18
        }
    }
    var ripplesEnabled: Bool { self != .performance }
}

// MARK: - 反应堆地形场景（网页端 MapScene 的 SceneKit 移植）

final class ReactorScene {
    let root = SCNNode()
    private(set) var blocks: [SCNNode] = []
    private var blockBase: [Float] = []       // 每个方块的基准相位/位置
    private var blockRadius: [Float] = []
    private var floats: [SCNNode] = []
    private var floatPhase: [Double] = []
    private var floatSpeed: [Double] = []
    private var floatSize: [Float] = []
    private var ripples: [SCNNode] = []
    private var ripplePhase: [Double] = []
    private var rippleMax: [Double] = []
    private var time: Double = 0

    init(mode: RenderMode) {
        root.name = "reactor"
        buildTerrain(mode: mode)
        buildFloatingBlocks(mode: mode)
    }

    /// 每帧更新（由 SCNSceneRendererDelegate 或视图持有者每帧回调）
    func update(delta: Double) {
        time += delta
        let fb = AudioVisualFeedback.shared
        let heightBase = Float(fb.energy) * 2.2 + 0.6
        let wave = Float(fb.wave)
        let bounce = Float(fb.bounce)

        for (i, node) in blocks.enumerated() {
            let r = blockRadius[i]
            let p = blockBase[i]
            // 地形起伏：基础能量高度 + 涡卷波动（沿距核心半径的同心波）+ 鼓点放大
            let ripple = rippleHeight(i)
            var h = heightBase + Float(sin(r * 1.4 + p + Float(time) * 1.8)) * 0.5 * wave
            h += Float(cos(r * 0.8 - Float(time) * 1.2)) * 0.4 * wave
            h = max(0.15, h * (1 + bounce * 0.35) + ripple)
            node.position.y = h
        }

        for (i, node) in floats.enumerated() {
            let bob = Float(sin(time * floatSpeed[i] * 2 + floatPhase[i])) * 0.8
            let pulseScale = (0.4 + Float(fb.kick) * 1.2) * floatSize[i]
            node.scale = SCNVector3(pulseScale, pulseScale, pulseScale)
            node.position.y = node.position.y - (node.position.y - (3.5 + bob + Float(fb.energy) * 3)) * 0.1
            node.eulerAngles = SCNVector3(Float(time * 0.4 + floatPhase[i]), Float(time * 0.3), Float(time * 0.2))
        }

        // 波纹环漫演化后移除
        for i in stride(from: ripples.count - 1, through: 0, by: -1) {
            ripplePhase[i] += delta
            let p = ripplePhase[i] / rippleMax[i]
            let s = Float(0.5 + p * 7.0)
            ripples[i].scale = SCNVector3(s, 1, s)
            ripples[i].opacity = CGFloat(1 - p)
            if p >= 1 {
                ripples[i].removeFromParentNode()
                ripples.remove(at: i)
                ripplePhase.remove(at: i)
                rippleMax.remove(at: i)
            }
        }
    }

    /// 播放时在地形上产生扩散波纹（对应网页端 addRipple）
    func spawnRipple(x: Float, z: Float, strength: Double = 1) {
        let ring = SCNNode(geometry: SCNTorus(ringRadius: 0.15, pipeRadius: 0.06))
        ring.geometry?.materials = [rippleMaterial()]
        ring.position = SCNVector3(x, 0.4, z)
        ring.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
        ripples.append(ring)
        ripplePhase.append(0)
        rippleMax.append(1.1 + strength)
        root.addChildNode(ring)
    }

    private func rippleHeight(_ i: Int) -> Float {
        var h: Float = 0
        for (k, node) in ripples.enumerated() {
            let p = ripplePhase[k] / rippleMax[k]
            let dx = Float(blocks[i].position.x) - node.position.x
            let dz = Float(blocks[i].position.z) - node.position.z
            let dist = (dx * dx + dz * dz).squareRoot()
            let radius = 0.5 + p * 7.0
            let gap = 1.0 - Float((dist - radius).magnitude) / 1.4
            let effect = max(Float(0), gap)
            h += effect * 1.6 * (1 - Float(p))
        }
        return h
    }

    private func resetRipples() {
        for n in ripples { n.removeFromParentNode() }
        ripples.removeAll()
        ripplePhase.removeAll()
        rippleMax.removeAll()
    }

    private func buildTerrain(mode: RenderMode) {
        let side = mode.gridSide
        let spacing = mode.gridSpacing
        let half = Float(side - 1) * spacing / 2
        let material = blockMaterial(mode: mode)

        // 圆形范围：距中心半径内放置方块 => 反应堆转盘
        let radius = half * 0.92
        for x in 0..<side {
            for z in 0..<side {
                let px = Float(x) * spacing - half
                let pz = Float(z) * spacing - half
                let r = (px * px + pz * pz).squareRoot()
                guard r <= radius else { continue }

                let box = SCNBox(width: CGFloat(spacing * 0.82), height: 1, length: CGFloat(spacing * 0.82), chamferRadius: 0.06)
                box.materials = [material]
                let node = SCNNode(geometry: box)
                node.position = SCNVector3(px, 0.5, pz)
                root.addChildNode(node)
                blocks.append(node)
                blockRadius.append(r)
                blockBase.append(Float(x) * 0.72 + Float(z) * 0.54)
            }
        }
    }

    private func buildFloatingBlocks(mode: RenderMode) {
        let mat = floatBlockMaterial()
        // 环绕悬浮方块（分布在圆盘外围上空）
        for i in 0..<mode.floatingBlocks {
            let angle = Double(i) / Double(mode.floatingBlocks) * Double.pi * 2 * 2.6 + Double(i).truncatingRemainder(dividingBy: 3) * 0.4
            let radius = Double(mode.gridSide) * Double(mode.gridSpacing) * 0.62
            let box = SCNBox(width: 0.9, height: 0.9, length: 0.9, chamferRadius: 0.12)
            box.materials = [mat]
            let node = SCNNode(geometry: box)
            node.position = SCNVector3(Float(cos(angle) * radius), 3.2, Float(sin(angle) * radius))
            root.addChildNode(node)
            floats.append(node)
            floatPhase.append(Double(i) * 0.73)
            floatSpeed.append(0.2 + Double(i).truncatingRemainder(dividingBy: 5) * 0.09)
            floatSize.append(0.7 + Float(i % 7) * 0.06)
        }
    }

    private func blockMaterial(mode: RenderMode) -> SCNMaterial {
        let m = SCNMaterial()
        m.diffuse.contents = UIColor(hex: 0x2B3BB8)
        m.emission.contents = UIColor(hex: 0x3B63D9)
        m.transparency = mode == .performance ? 0.85 : 0.75
        m.lightingModel = .physicallyBased
        m.metalness.contents = 0.5
        m.roughness.contents = 0.4
        return m
    }

    private func floatBlockMaterial() -> SCNMaterial {
        let m = SCNMaterial()
        m.diffuse.contents = UIColor(hex: 0xE8C15A)
        m.emission.contents = UIColor(hex: 0xE8A23A)
        m.transparency = 0.85
        m.lightingModel = .physicallyBased
        m.metalness.contents = 0.4
        m.roughness.contents = 0.3
        return m
    }

    private func rippleMaterial() -> SCNMaterial {
        let m = SCNMaterial()
        m.diffuse.contents = UIColor.white
        m.emission.contents = UIColor(hex: 0x8FA6F5)
        m.transparency = 0.9
        return m
    }
}

// MARK: - SceneKit 视图（把反应堆场景接入 SwiftUI，驱动每一帧）

struct Scene3DView: UIViewRepresentable {
    let mode: RenderMode

    func makeCoordinator() -> Coordinator { Coordinator(mode: mode) }

    func makeUIView(context: Context) -> SCNView {
        let scn = SCNView()
        let scene = SCNScene()
        scene.background.contents = UIColor(hex: 0x0B0E1E)

        // 相机（倾斜俯视 = 网页端 [-37,26,92] 的透视感）
        let cameraNode = SCNNode()
        cameraNode.camera = SCNCamera()
        cameraNode.camera?.zNear = 0.1
        cameraNode.position = SCNVector3(0, 24, 30)
        cameraNode.eulerAngles = SCNVector3(-Float.pi / 6, 0, 0)
        scene.rootNode.addChildNode(cameraNode)

        // 灯光
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 300
        scene.rootNode.addChildNode(ambient)
        let dir = SCNNode()
        dir.light = SCNLight()
        dir.light?.type = .directional
        dir.light?.intensity = 700
        dir.light?.color = UIColor(hex: 0xBBD0FF)
        dir.position = SCNVector3(8, 20, 6)
        scene.rootNode.addChildNode(dir)

        // 反应堆转盘 + 慢旋转
        let reactor = ReactorScene(mode: mode)
        scene.rootNode.addChildNode(reactor.root)
        let spin = SCNAction.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: mode == .performance ? 70 : 46)
        reactor.root.runAction(.repeatForever(spin))

        context.coordinator.reactor = reactor
        context.coordinator.spawnTimer(scn)

        scn.scene = scene
        scn.backgroundColor = UIColor(hex: 0x0B0E1E)
        scn.allowsCameraControl = true
        scn.antialiasingMode = mode.antialiasing
        scn.preferredFramesPerSecond = mode.framesPerSecond
        scn.isPlaying = true
        return scn
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        guard context.coordinator.mode != mode else { return }
        context.coordinator.mode = mode
        // 模式切换：重建场景
        if let reactor = context.coordinator.reactor {
            reactor.root.removeFromParentNode()
        }
        uiView.scene = nil
        let scene = SCNScene()
        scene.background.contents = UIColor(hex: 0x0B0E1E)
        let reactor = ReactorScene(mode: mode)
        scene.rootNode.addChildNode(reactor.root)
        let spin = SCNAction.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: mode == .performance ? 70 : 46)
        reactor.root.runAction(.repeatForever(spin))
        context.coordinator.reactor = reactor
        uiView.scene = scene
        uiView.antialiasingMode = mode.antialiasing
        uiView.preferredFramesPerSecond = mode.framesPerSecond
    }

    final class Coordinator {
        var mode: RenderMode
        var reactor: ReactorScene?
        private var timer: Timer?

        init(mode: RenderMode) { self.mode = mode }

        func spawnTimer(_ scn: SCNView) {
            let interval: TimeInterval = mode == .performance ? 1.0 / 30 : 1.0 / 40
            timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self, let reactor = self.reactor else { return }
                    reactor.update(delta: interval)
                    // 播放时每秒产生一两次地形波纹（对应网页端自动涟漪）
                    if AudioVisualFeedback.shared.playing {
                        self.rippleCooldown -= interval
                        if self.rippleCooldown <= 0 {
                            self.rippleCooldown = Double.random(in: 0.7...1.6)
                            let angle = Double.random(in: 0..<(2 * .pi))
                            let r = Float.random(in: 4..<10)
                            reactor.spawnRipple(x: Float(cos(angle)) * r, z: Float(sin(angle)) * r,
                                                strength: Double.random(in: 0.7...1.4))
                        }
                    }
                }
            }
            timer?.tolerance = interval * 0.2
        }

        private var rippleCooldown: Double = 0.2

        deinit {
            timer?.invalidate()
        }
    }
}

// MARK: - 3D 页（模式切换 + 进入独立可视化）

struct Scene3DHostView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var mode: RenderMode = .balanced
    @State private var showInfo = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.appBackground, Color.brandPrimary.opacity(0.12)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            Scene3DView(mode: mode)
                .ignoresSafeArea(edges: .top)

            VStack {
                Spacer()
                if showInfo {
                    Text("反应堆地形可视化：立方体阵被音乐能量驱动起伏，鼓点脉冲方块、扩散波纹环绕。\n画质优先=高密度·4X抗锯齿；性能模式=低密度·30FPS")
                        .font(.caption)
                        .foregroundStyle(.textTertiary)
                        .padding(10)
                        .background(.cardSurface.opacity(0.6))
                        .glassEffect(in: .rect(cornerRadius: 12))
                        .padding()
                }
            }
        }
        .navigationTitle("3D 可视化")
        .navigationBarTitleDisplayMode(.inline)
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    withAnimation { showInfo.toggle() }
                } label: {
                    Image(systemName: "info.circle")
                }
            }
        }
    }
}

// MARK: - UIColor 便捷

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255.0,
                  green: CGFloat((hex >> 8) & 0xFF) / 255.0,
                  blue: CGFloat(hex & 0xFF) / 255.0,
                  alpha: 1.0)
    }
}