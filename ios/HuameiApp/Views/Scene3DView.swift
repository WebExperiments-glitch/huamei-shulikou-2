import SwiftUI
import SceneKit

// MARK: - 3D 音乐可视化场景（SceneKit 液态玻璃环 + 星尘粒子）

struct Scene3DView: UIViewRepresentable {
    func makeUIView(context: Context) -> SCNView {
        let scn = SCNView()
        scn.scene = Scene3DBuilder.build()
        scn.backgroundColor = .clear
        scn.allowsCameraControl = true
        scn.antialiasingMode = .multisampling4X
        scn.isPlaying = true
        return scn
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}
}

enum Scene3DBuilder {
    static func build() -> SCNScene {
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

        // 液态玻璃效果的三层环
        let ringColors: [UIColor] = [
            UIColor(hex: 0x7B96F0), UIColor(hex: 0xD4A53A), UIColor(hex: 0x34C98D),
        ]
        for (i, color) in ringColors.enumerated() {
            let torus = SCNTorus(ringRadius: CGFloat(1.0 + Double(i) * 0.32), pipeRadius: 0.015)
            let mat = SCNMaterial()
            mat.diffuse.contents = color.withAlphaComponent(0.55)
            mat.transparency = 0.55
            mat.metalness.contents = 0.9
            mat.roughness.contents = 0.25
            torus.materials = [mat]
            let node = SCNNode(geometry: torus)
            node.eulerAngles = SCNVector3(Float.pi / 2 + Double(i) * 0.28, Double(i) * 0.6, 0)
            let spin = SCNAction.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: 8 + Double(i) * 3)
            node.runAction(.repeatForever(spin))
            scene.rootNode.addChildNode(node)
        }

        // 中心发光球
        let sphere = SCNSphere(radius: 0.42)
        let sm = SCNMaterial()
        sm.diffuse.contents = UIColor(hex: 0x3B63D9).withAlphaComponent(0.7)
        sm.emission.contents = UIColor(hex: 0x3B63D9)
        sm.transparency = 0.65
        sphere.materials = [sm]
        let sphereNode = SCNNode(geometry: sphere)
        let pulse = SCNAction.sequence([
            SCNAction.scale(to: 1.12, duration: 1.2),
            SCNAction.scale(to: 0.95, duration: 1.2),
        ])
        sphereNode.runAction(.repeatForever(pulse))
        scene.rootNode.addChildNode(sphereNode)

        // 星尘粒子场
        let particles = SCNParticleSystem()
        particles.particleImage = UIImage(systemName: "music.note")
        particles.particleColor = UIColor(hex: 0x7B96F0)
        particles.birthRate = 120
        particles.particleLifeSpan = 3.2
        particles.emitterShape = SCNBox(width: 3, height: 0.1, length: 3, chamferRadius: 0)
        particles.particleVelocity = 0.25
        particles.particleColorVariation = SCNVector4(0.4, 0.4, 0.4, 0.3)
        let emitter = SCNNode()
        emitter.position = SCNVector3(0, -1.6, 0)
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

// MARK: - 3D 页

struct Scene3DHostView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var showInfo = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.appBackground, Color.brandPrimary.opacity(0.12)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            Scene3DView()
                .ignoresSafeArea(edges: .top)

            VStack {
                Spacer()
                if showInfo {
                    Text("液态玻璃 3D 可视化：旋转层环 + 音符星尘粒子，手指可拖动视角")
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