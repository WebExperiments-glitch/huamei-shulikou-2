import SwiftUI
import SceneKit

// MARK: - 3D 音乐可视化场景（SceneKit 液态玻璃环 + 星尘粒子）
// 三档渲染模式：画质优先 / 普通 / 性能，按设备负载可随时切换

enum RenderMode: String, CaseIterable, Identifiable {
    case quality
    case balanced
    case performance

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

    // 渲染参数
    var framesPerSecond: Int { self == .performance ? 30 : 60 }
    var antialiasing: SCNAntialiasingMode {
        switch self {
        case .quality: return .multisampling4X
        case .balanced: return .multisampling2X
        case .performance: return .none
        }
    }
    var ringCount: Int {
        switch self {
        case .quality: return 4
        case .balanced: return 3
        case .performance: return 2
        }
    }
    var particleBirthRate: CGFloat {
        switch self {
        case .quality: return 100
        case .balanced: return 40
        case .performance: return 10
        }
    }
    var particleSize: CGFloat {
        switch self {
        case .quality: return 0.06
        case .balanced: return 0.05
        case .performance: return 0.035
        }
    }
    var ringRadiusStep: Double {
        switch self {
        case .quality: return 0.26
        case .balanced: return 0.32
        case .performance: return 0.42
        }
    }
    var ringPipeRadius: CGFloat {
        switch self {
        case .quality: return 0.02
        case .balanced: return 0.015
        case .performance: return 0.012
        }
    }
}

struct Scene3DView: UIViewRepresentable {
    let mode: RenderMode

    func makeCoordinator() -> Coordinator { Coordinator(mode: mode) }

    func makeUIView(context: Context) -> SCNView {
        let scn = SCNView()
        scn.scene = Scene3DBuilder.build(mode: mode)
        apply(scn, mode: mode)
        scn.allowsCameraControl = true
        scn.isPlaying = true
        return scn
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        guard context.coordinator.mode != mode else { return }
        context.coordinator.mode = mode
        // 模式切换：重建场景 + 套用对应渲染参数
        uiView.scene = Scene3DBuilder.build(mode: mode)
        apply(uiView, mode: mode)
    }

    private func apply(_ scn: SCNView, mode: RenderMode) {
        scn.antialiasingMode = mode.antialiasing
        scn.preferredFramesPerSecond = mode.framesPerSecond
    }

    final class Coordinator {
        var mode: RenderMode
        init(mode: RenderMode) { self.mode = mode }
    }
}

enum Scene3DBuilder {
    static func build(mode: RenderMode) -> SCNScene {
        let scene = SCNScene()

        // 相机
        let cameraNode = SCNNode()
        cameraNode.camera = SCNCamera()
        cameraNode.position = SCNVector3(0, 0.6, 4.2)
        cameraNode.camera?.zNear = 0.01
        scene.rootNode.addChildNode(cameraNode)

        // 环境光 + 点光
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 400
        scene.rootNode.addChildNode(ambient)

        let point = SCNNode()
        point.light = SCNLight()
        point.light?.type = .omni
        point.light?.color = UIColor(hex: 0x7B96F0)
        point.position = SCNVector3(0, 1.5, 2)
        scene.rootNode.addChildNode(point)

        // 液态玻璃环（数量随模式）
        let ringColors: [UIColor] = [
            UIColor(hex: 0x7B96F0), UIColor(hex: 0xD4A53A), UIColor(hex: 0x34C98D), UIColor(hex: 0x3B63D9),
        ]
        for i in 0..<max(mode.ringCount, 1) {
            let color = ringColors[i % ringColors.count]
            let torus = SCNTorus(ringRadius: CGFloat(0.7 + Double(i) * mode.ringRadiusStep),
                                 pipeRadius: mode.ringPipeRadius)
            let mat = SCNMaterial()
            mat.diffuse.contents = color.withAlphaComponent(mode == .performance ? 0.42 : 0.55)
            mat.transparency = mode == .performance ? 0.42 : 0.55
            mat.metalness.contents = 0.9
            mat.roughness.contents = 0.25
            torus.materials = [mat]

            let node = SCNNode(geometry: torus)
            // 拆开表达式，显式 Float 类型，避免编译器类型检查超时
            let tilt = Float.pi / 2 + Float(i) * 0.28
            let yaw = Float(i) * 0.6
            node.eulerAngles = SCNVector3(tilt, yaw, 0)
            let duration = mode == .performance ? 13.0 + Double(i) * 4 : 8.0 + Double(i) * 3
            let spin = SCNAction.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: duration)
            node.runAction(.repeatForever(spin))
            scene.rootNode.addChildNode(node)
        }

        // 中心发光球（性能模式放缓节奏）
        let sphere = SCNSphere(radius: 0.42)
        let sm = SCNMaterial()
        sm.diffuse.contents = UIColor(hex: 0x3B63D9).withAlphaComponent(0.7)
        sm.emission.contents = UIColor(hex: 0x3B63D9)
        sm.transparency = 0.65
        sphere.materials = [sm]
        let sphereNode = SCNNode(geometry: sphere)
        let pulseDuration = mode == .performance ? 2.4 : 1.2
        let pulse = SCNAction.sequence([
            SCNAction.scale(to: mode == .performance ? 1.05 : 1.12, duration: pulseDuration),
            SCNAction.scale(to: 0.97, duration: pulseDuration),
        ])
        sphereNode.runAction(.repeatForever(pulse))
        scene.rootNode.addChildNode(sphereNode)

        // 星尘粒子场（出生率随模式：画质 100 / 普通 40 / 性能 10）
        let particles = SCNParticleSystem()
        particles.particleImage = UIImage(systemName: "music.note")
        particles.particleColor = UIColor(hex: 0x7B96F0)
        particles.birthRate = mode.particleBirthRate
        particles.particleLifeSpan = 4.0
        particles.particleSize = mode.particleSize
        particles.emitterShape = SCNBox(width: 2.2, height: 0.1, length: 2.2, chamferRadius: 0)
        particles.particleVelocity = 0.18
        particles.particleColorVariation = SCNVector4(0.4, 0.4, 0.4, 0.3)
        let emitter = SCNNode()
        emitter.position = SCNVector3(0, -1.4, 0)
        emitter.addParticleSystem(particles)
        scene.rootNode.addChildNode(emitter)

        return scene
    }
}

extension UIColor {
    /// 从 0xRRGGBB 构造颜色（3D 场景内使用，避免依赖 SwiftUI）
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255.0,
                  green: CGFloat((hex >> 8) & 0xFF) / 255.0,
                  blue: CGFloat(hex & 0xFF) / 255.0,
                  alpha: 1.0)
    }
}

// MARK: - 3D 页（模式切换）

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
                    Text("液态玻璃 3D 可视化：旋转层环 + 音符星尘粒子，手指可拖动视角。\n画质优先=4X抗锯齿·高粒子；性能模式=30FPS·低粒子，最省电")
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