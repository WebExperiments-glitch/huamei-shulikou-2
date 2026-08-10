import { Download } from "lucide-react"

/** 图表 PNG 导出按钮：调用 useEChart 返回的 getDataURL 触发下载。 */
export function ChartExport({
  getURL,
  filename,
}: {
  getURL: () => string | null
  filename: string
}) {
  const onExport = () => {
    const url = getURL()
    if (!url) return
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  return (
    <button className="chip" onClick={onExport} title="导出为 PNG 图片">
      <Download size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
      PNG
    </button>
  )
}
