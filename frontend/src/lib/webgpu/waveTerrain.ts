/**
 * WebGPU 波动地形 / 粒子星云背景引擎。
 *
 * 全链路走 GPU：
 *  - compute pass 每帧更新网格顶点高度（多层正弦波叠加，纯 GPU 模拟）
 *  - render pass 绘制半透明渐变地形 + 每个顶点的辉光粒子（instanced 点精灵）
 *
 * 设计要点：
 *  - 颜色从 CSS 变量（--sky / --accent / --pink）读取，随明暗主题自动适配；
 *  - canvas 透明合成（alphaMode: premultiplied），不遮挡页面内容；
 *  - 遵循 prefers-reduced-motion（由上层组件控制是否创建本引擎）；
 *  - 浏览器不支持 WebGPU 时由上层组件回退到 Canvas2D 粒子。
 */

export const WEBGPU_OK =
  typeof navigator !== "undefined" && !!navigator.gpu

/* TS DOM 库未提供这几个 usage/shaderStage 常量对象，按 WebGPU 规范补齐 */
const GPUBufferUsage = {
  MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008,
  INDEX: 0x0010, VERTEX: 0x0020, UNIFORM: 0x0040, STORAGE: 0x0080,
  INDIRECT: 0x0100, QUERY_RESOLVE: 0x0200,
} as const
const GPUShaderStage = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const
const GPUTextureUsage = {
  COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10,
} as const

/* ------------------------------------------------------------------ *
 * 颜色 / CSS 工具
 * ------------------------------------------------------------------ */

/** hex -> [r, g, b, a]，取值 0..1。解析失败返回默认蓝紫色。 */
function hexToRgba(hex: string, a = 1): [number, number, number, number] {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const n = parseInt(h, 16)
  if (Number.isNaN(n) || h.length !== 6) return [0.45, 0.55, 0.9, a]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a]
}

function readCssVar(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || ""
  } catch {
    return ""
  }
}

/* ------------------------------------------------------------------ *
 * 矩阵工具（列主序 Float32Array）
 * ------------------------------------------------------------------ */

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) * nf
  m[11] = -1
  m[14] = 2 * far * near * nf
  return m
}

function lookAt(eye: number[], target: number[], up: number[]): Float32Array {
  let z0 = eye[0]! - target[0]!
  let z1 = eye[1]! - target[1]!
  let z2 = eye[2]! - target[2]!
  const zl = Math.hypot(z0, z1, z2) || 1
  z0 /= zl; z1 /= zl; z2 /= zl
  // x = normalize(cross(up, z))
  let x0 = up[1]! * z2 - up[2]! * z1
  let x1 = up[2]! * z0 - up[0]! * z2
  let x2 = up[0]! * z1 - up[1]! * z0
  const xl = Math.hypot(x0, x1, x2) || 1
  x0 /= xl; x1 /= xl; x2 /= xl
  // y = cross(z, x)
  const y0 = z1 * x2 - z2 * x1
  const y1 = z2 * x0 - z0 * x2
  const y2 = z0 * x1 - z1 * x0
  const m = new Float32Array(16)
  m[0] = x0; m[1] = y0; m[2] = z0; m[3] = 0
  m[4] = x1; m[5] = y1; m[6] = z1; m[7] = 0
  m[8] = x2; m[9] = y2; m[10] = z2; m[11] = 0
  m[12] = -(x0 * eye[0]! + x1 * eye[1]! + x2 * eye[2]!)
  m[13] = -(y0 * eye[0]! + y1 * eye[1]! + y2 * eye[2]!)
  m[14] = -(z0 * eye[0]! + z1 * eye[1]! + z2 * eye[2]!)
  m[15] = 1
  return m
}

/** 列主序矩阵乘法 result = a * b。 */
function matMul(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + row]! * b[c * 4 + k]!
      r[c * 4 + row] = s
    }
  }
  return r
}

/* ------------------------------------------------------------------ *
 * WGSL 着色器
 * ------------------------------------------------------------------ */

const WGSL_PARAMS = /* wgsl */ `
struct Params {
  viewProj: mat4x4<f32>,
  time: f32,
  amp: f32,
  freq: f32,
  pointSize: f32,
  colorA: vec4<f32>,
  colorB: vec4<f32>,
  colorC: vec4<f32>,
};
`

const WGSL_COMPUTE = /* wgsl */ `
${WGSL_PARAMS}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec3<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  if (i >= arrayLength(&pos)) { return; }
  let p = pos[i];
  let t = params.time;
  let f = params.freq;
  let x = p.x;
  let z = p.z;
  var h = sin(x * f + t * 1.1) * 0.5;
  h += sin(z * f * 1.32 + t * 1.45 + 1.7) * 0.34;
  h += sin((x * 1.8 + z * 0.9) * f * 0.55 + t * 0.7) * 0.16;
  h += sin(length(vec2<f32>(x, z)) * f * 1.9 - t * 1.15) * 0.14;
  pos[i] = vec3<f32>(x, h * params.amp, z);
}
`

const WGSL_VS = /* wgsl */ `
${WGSL_PARAMS}

@group(0) @binding(0) var<uniform> params: Params;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) h: f32,
};

@vertex
fn vs_main(@location(0) p: vec3<f32>) -> VSOut {
  var out: VSOut;
  out.clip = params.viewProj * vec4<f32>(p, 1.0);
  out.h = p.y;
  return out;
}
`

const WGSL_FS_FILL = /* wgsl */ `
${WGSL_PARAMS}

@group(0) @binding(0) var<uniform> params: Params;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) h: f32,
};

@fragment
fn fs_fill(in: VSOut) -> @location(0) vec4<f32> {
  let n = clamp(in.h * 0.32 + 0.5, 0.0, 1.0);
  let c1 = mix(params.colorA, params.colorB, smoothstep(0.0, 0.55, n));
  let c = mix(c1, params.colorC, smoothstep(0.5, 1.0, n));
  let a = 0.30;
  return vec4<f32>(c.rgb * a, a);
}
`

const WGSL_VS_POINT = /* wgsl */ `
${WGSL_PARAMS}

@group(0) @binding(0) var<uniform> params: Params;

struct PSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) corner: vec2<f32>,
  @location(1) h: f32,
};

@vertex
fn vs_point(@location(0) corner: vec2<f32>, @location(1) p: vec3<f32>) -> PSOut {
  var out: PSOut;
  var clip = params.viewProj * vec4<f32>(p, 1.0);
  let s = params.pointSize * clip.w;
  clip.x += corner.x * s;
  clip.y += corner.y * s;
  out.clip = clip;
  out.corner = corner;
  out.h = p.y;
  return out;
}
`

const WGSL_FS_POINT = /* wgsl */ `
${WGSL_PARAMS}

@group(0) @binding(0) var<uniform> params: Params;

struct PSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) corner: vec2<f32>,
  @location(1) h: f32,
};

@fragment
fn fs_point(in: PSOut) -> @location(0) vec4<f32> {
  let d = length(in.corner);
  let glow = exp(-d * d * 6.0);
  let n = clamp(in.h * 0.32 + 0.5, 0.0, 1.0);
  let c = mix(params.colorB, params.colorC, smoothstep(0.45, 1.0, n));
  let a = glow * 0.85;
  return vec4<f32>(c.rgb * a, a);
}
`

/* ------------------------------------------------------------------ *
 * 引擎
 * ------------------------------------------------------------------ */

/** 网格分辨率（每边顶点数）随密度档位变化。 */
const GRID_N: Record<"low" | "medium" | "high", number> = { low: 46, medium: 70, high: 96 }
const GRID_EXT = 4.6 // 网格半边长（世界坐标）
const UNIFORM_SIZE = 32 * 4 // 32 × f32 = 128 字节

function createInitBuffer(
  device: GPUDevice,
  size: number,
  usage: number,
  data: ArrayBufferView,
): GPUBuffer {
  const buf = device.createBuffer({ size, usage, mappedAtCreation: true })
  new Uint8Array(buf.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  )
  buf.unmap()
  return buf
}

export type TerrainDensity = "low" | "medium" | "high"

export class WaveTerrain {
  private device: GPUDevice
  private context: GPUCanvasContext
  private format: GPUTextureFormat

  private count: number
  private workgroups: number
  private indexCount: number
  private time = 0
  private lastTime = 0
  private disposed = false
  private raf = 0
  private pointSize = 0.0016
  private colors: [number, number, number, number][] = [
    [0.35, 0.6, 0.9, 1],
    [0.23, 0.39, 0.85, 1],
    [0.76, 0.1, 0.55, 1],
  ]

  private uniforms!: GPUBuffer
  private positions!: GPUBuffer
  private indices!: GPUBuffer
  private quad!: GPUBuffer
  private depth!: GPUTexture
  private depthView!: GPUTextureView

  private bgCompute!: GPUBindGroup
  private bgRender!: GPUBindGroup
  private computePipeline!: GPUComputePipeline
  private fillPipeline!: GPURenderPipeline
  private pointPipeline!: GPURenderPipeline

  private constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
    this.device = device
    this.context = context
    this.format = format
    this.count = 0
    this.workgroups = 0
    this.indexCount = 0
  }

  static async create(canvas: HTMLCanvasElement, density: TerrainDensity): Promise<WaveTerrain | null> {
    const gpu = navigator.gpu
    if (!gpu) return null
    const adapter = await gpu.requestAdapter()
    if (!adapter) return null
    const device = await adapter.requestDevice()
    const context = canvas.getContext("webgpu") as GPUCanvasContext | null
    if (!context) return null
    const format = gpu.getPreferredCanvasFormat()
    context.configure({
      device,
      format,
      alphaMode: "premultiplied",
    })
    const engine = new WaveTerrain(device, context, format)
    engine.init(density)
    return engine
  }

  private init(density: TerrainDensity) {
    const d = this.device
    const n = GRID_N[density]
    const count = n * n
    this.count = count
    this.workgroups = Math.ceil(count / 64)

    // 网格顶点初始位置（x / z 平面，y 由 compute 每帧写入）
    const pos = new Float32Array(count * 3)
    let k = 0
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -GRID_EXT + (2 * GRID_EXT * ix) / (n - 1)
        const z = -GRID_EXT + (2 * GRID_EXT * iz) / (n - 1)
        pos[k++] = x
        pos[k++] = 0
        pos[k++] = z
      }
    }

    // 三角形索引
    const idx: number[] = []
    for (let iz = 0; iz < n - 1; iz++) {
      for (let ix = 0; ix < n - 1; ix++) {
        const a = iz * n + ix
        const b = a + 1
        const c = a + n
        const e = c + 1
        idx.push(a, c, b, b, c, e)
      }
    }
    this.indexCount = idx.length
    const idxArr = new Uint16Array(idx)

    // 点精灵四角（triangle-strip，4 顶点）
    const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5])

    this.uniforms = d.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.positions = createInitBuffer(d, count * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX, pos)
    this.indices = createInitBuffer(d, idxArr.byteLength, GPUBufferUsage.INDEX, idxArr)
    this.quad = createInitBuffer(d, quad.byteLength, GPUBufferUsage.VERTEX, quad)

    // ---- 绑定组与管线 ----
    const bglCompute = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    })
    const bglRender = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    })

    this.bgCompute = d.createBindGroup({
      layout: bglCompute,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer: this.positions } },
      ],
    })
    this.bgRender = d.createBindGroup({
      layout: bglRender,
      entries: [{ binding: 0, resource: { buffer: this.uniforms } }],
    })

    const computeModule = d.createShaderModule({ code: WGSL_COMPUTE })
    const renderModule = d.createShaderModule({ code: WGSL_VS })
    const fillModule = d.createShaderModule({ code: WGSL_FS_FILL })
    const pointVSModule = d.createShaderModule({ code: WGSL_VS_POINT })
    const pointFSModule = d.createShaderModule({ code: WGSL_FS_POINT })

    this.computePipeline = d.createComputePipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [bglCompute] }),
      compute: { module: computeModule, entryPoint: "main" },
    })

    const blend = {
      color: {
        srcFactor: "one" as GPUBlendFactor,
        dstFactor: "one-minus-src-alpha" as GPUBlendFactor,
        operation: "add" as GPUBlendOperation,
      },
      alpha: {
        srcFactor: "one" as GPUBlendFactor,
        dstFactor: "one-minus-src-alpha" as GPUBlendFactor,
        operation: "add" as GPUBlendOperation,
      },
    }
    const depthStencil: GPUDepthStencilState = {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    }

    this.fillPipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [bglRender] }),
      vertex: {
        module: renderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
          },
        ],
      },
      fragment: {
        module: fillModule,
        entryPoint: "fs_fill",
        targets: [{ format: this.format, blend }],
      },
      primitive: { topology: "triangle-list", cullMode: "none", frontFace: "ccw" },
      depthStencil,
    })

    this.pointPipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [bglRender] }),
      vertex: {
        module: pointVSModule,
        entryPoint: "vs_point",
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            arrayStride: 12,
            stepMode: "instance",
            attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }],
          },
        ],
      },
      fragment: {
        module: pointFSModule,
        entryPoint: "fs_point",
        targets: [{ format: this.format, blend }],
      },
      primitive: { topology: "triangle-strip", cullMode: "none", frontFace: "ccw" },
      depthStencil: { ...depthStencil, depthWriteEnabled: false, depthCompare: "less-equal" },
    })

    this.updatePalette()
    this.resize()
    this.lastTime = performance.now() / 1000
    window.addEventListener("resize", this.onResize)
    this.raf = requestAnimationFrame(this.frame)
  }

  /** 从 CSS 变量刷新配色（明暗主题切换时调用）。 */
  updatePalette() {
    const accent = hexToRgba(readCssVar("--accent") || "#3b63d9")
    const sky = hexToRgba(readCssVar("--sky") || "#58a6e8")
    const pink = hexToRgba(readCssVar("--pink") || "#d069a5")
    this.colors = [sky, accent, pink]
  }

  private onResize = () => this.resize()

  private resize() {
    const canvas = this.context.canvas as HTMLCanvasElement
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.floor(window.innerWidth * dpr))
    const h = Math.max(1, Math.floor(window.innerHeight * dpr))
    canvas.width = w
    canvas.height = h
    // 粒子大小（CSS 像素），不随 dpr 变化
    this.pointSize = 3.2 / Math.max(window.innerWidth, 1)
    // 深度缓冲随画布尺寸重建
    if (this.depth) this.depth.destroy()
    this.depth = this.device.createTexture({
      size: [w, h],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.depthView = this.depth.createView()
  }

  private writeUniform() {
    const canvas = this.context.canvas as HTMLCanvasElement
    const aspect = canvas.width / Math.max(canvas.height, 1)
    const proj = perspective((50 * Math.PI) / 180, aspect, 0.1, 60)
    // 相机轻微摆动，产生呼吸感
    const sx = Math.sin(this.time * 0.12) * 0.55
    const sy = 3.4 + Math.sin(this.time * 0.09) * 0.25
    const view = lookAt([sx, sy, 7.0], [0, 0, 0], [0, 1, 0])
    const vp = matMul(proj, view)

    const u = new Float32Array(32)
    u.set(vp, 0)
    u[16] = this.time
    u[17] = 1.0 // amp
    u[18] = 1.15 // freq
    u[19] = this.pointSize
    u.set(this.colors[0]!, 20)
    u.set(this.colors[1]!, 24)
    u.set(this.colors[2]!, 28)
    this.device.queue.writeBuffer(this.uniforms, 0, u)
  }

  private frame = () => {
    if (this.disposed) return
    const now = performance.now() / 1000
    const dt = Math.min(now - this.lastTime, 0.05)
    this.lastTime = now
    this.time += dt * 0.8

    this.writeUniform()

    const encoder = this.device.createCommandEncoder()

    const pass = encoder.beginComputePass()
    pass.setPipeline(this.computePipeline)
    pass.setBindGroup(0, this.bgCompute)
    pass.dispatchWorkgroups(this.workgroups)
    pass.end()

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    })
    // 半透明地形
    renderPass.setPipeline(this.fillPipeline)
    renderPass.setBindGroup(0, this.bgRender)
    renderPass.setVertexBuffer(0, this.positions)
    renderPass.setIndexBuffer(this.indices, "uint16")
    renderPass.drawIndexed(this.indexCount)
    // 顶点辉光粒子
    renderPass.setPipeline(this.pointPipeline)
    renderPass.setBindGroup(0, this.bgRender)
    renderPass.setVertexBuffer(0, this.quad)
    renderPass.setVertexBuffer(1, this.positions)
    renderPass.draw(4, this.count)
    renderPass.end()

    this.device.queue.submit([encoder.finish()])
    this.raf = requestAnimationFrame(this.frame)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener("resize", this.onResize)
    this.depth?.destroy()
    this.positions?.destroy()
    this.indices?.destroy()
    this.quad?.destroy()
    this.uniforms?.destroy()
    this.context.unconfigure?.()
  }
}
