import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}
interface State {
  error: Error | null
  info: string
}

/** 全局错误兜底：捕获子树渲染异常，显示友好提示并提供重试 + 错误详情。 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: "" }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    const stack = errorInfo.componentStack ?? ""
    this.setState({ info: stack })
    console.error("[ErrorBoundary]", error.message, stack)
  }

  reset = () => this.setState({ error: null, info: "" })

  copyError = () => {
    const { error, info } = this.state
    if (!error) return
    const text = `Error: ${error.message}\nStack: ${error.stack ?? "无"}\nComponent: ${info}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      const { error, info } = this.state
      return (
        <div className="error-boundary">
          <div className="eb-icon">⚠️</div>
          <h2>页面出错了</h2>
          <p className="eb-msg">{error.message}</p>
          {info && (
            <details className="eb-details">
              <summary>错误详情</summary>
              <pre>{error.stack ?? "无堆栈"}</pre>
              {info && <pre className="eb-comp-stack">{info}</pre>}
            </details>
          )}
          <div className="eb-actions">
            <button className="eb-retry" onClick={this.reset}>重试</button>
            <button className="eb-copy" onClick={this.copyError}>复制错误</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
