import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}
interface State {
  error: Error | null
}

/** 全局错误兜底：捕获子树渲染异常，显示友好提示并提供重试。 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div className="error-boundary">
          <div className="eb-icon">⚠️</div>
          <h2>页面出错了</h2>
          <p className="eb-msg">{this.state.error.message}</p>
          <button className="eb-retry" onClick={this.reset}>
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
