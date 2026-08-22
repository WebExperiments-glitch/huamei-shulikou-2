import { motion, AnimatePresence, MotionConfig } from "motion/react"
import type { ReactNode, CSSProperties } from "react"
import { useEffects } from "./effects"

/**
 * 可复用的 motion 动画原语（基于 motion / framer-motion）。
 * 仅作用于自有布局元素，避免干扰 Ant Design 自带转场的组件。
 * 每个原语都读取特效设置：对应开关关闭后退化为静态渲染。
 */

const EASE = [0.22, 0.61, 0.36, 1] as const

/** 页面进出场容器：淡入 + 上移 + 聚焦（模糊→清晰）+ 缩放，配合 AnimatePresence 实现电影感路由转场。 */
export function PageMotion({ children, className }: { children: ReactNode; className?: string }) {
  const on = useEffects((s) => s.master && s.pageTransition)
  if (!on) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16, scale: 0.985, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(8px)" }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** 进入视口时淡入上移（滚动揭示），once 默认只触发一次。带轻微失焦→聚焦的科幻感。 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  once = true,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  once?: boolean
  className?: string
}) {
  const on = useEffects((s) => s.master && s.reveal)
  if (!on) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/** 交错揭示容器：子级需配合 <StaggerItem>。挂载时交错入场。 */
export function StaggerGroup({
  children,
  stagger = 0.06,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode
  stagger?: number
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  const on = useEffects((s) => s.master && s.stagger)
  if (!on) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  )
}

/** 交错子项：淡入 + 上移。 */
export function StaggerItem({
  children,
  y = 16,
  className,
}: {
  children: ReactNode
  y?: number
  className?: string
}) {
  const on = useEffects((s) => s.master && s.stagger)
  if (!on) return <div className={className} style={{ minWidth: 0 }}>{children}</div>
  return (
    <motion.div
      className={className}
      style={{ minWidth: 0 }}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  )
}

export { AnimatePresence, MotionConfig }
