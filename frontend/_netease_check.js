import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/pages/Netease.tsx");const useEffect = __vite__cjsImport0_react["useEffect"]; const useMemo = __vite__cjsImport0_react["useMemo"]; const useState = __vite__cjsImport0_react["useState"];const _jsxDEV = __vite__cjsImport4_react_jsxDevRuntime["jsxDEV"]; const _Fragment = __vite__cjsImport4_react_jsxDevRuntime["Fragment"];import __vite__cjsImport0_react from "/node_modules/.vite/deps/react.js?v=e54d1c84";
import { api } from "/src/lib/api.ts?t=1786326355054";
import { Spinner, Empty } from "/src/components/ui.tsx?t=1786327624740";
import { Music2, ExternalLink, Search as SearchIcon, Clock, TrendingUp, Disc, Mic2, ListMusic, History, Flame, ArrowUpDown, Calendar, Hash, PlayCircle, X, Copy, Check, Sparkles, AlertCircle, BarChart3, Heart, MessageCircle, User, FolderOpen, Trash2 } from "/node_modules/.vite/deps/lucide-react.js?v=e54d1c84";
var _jsxFileName = "D:/DeepSeek前端代码/前端/未确定/术力口周榜/术力口/frontend/src/pages/Netease.tsx";
import __vite__cjsImport4_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=e54d1c84";
var _s = $RefreshSig$();
const TYPES = [
	{
		key: "song",
		label: "单曲",
		icon: Music2
	},
	{
		key: "artist",
		label: "歌手",
		icon: Mic2
	},
	{
		key: "album",
		label: "专辑",
		icon: Disc
	},
	{
		key: "playlist",
		label: "歌单",
		icon: ListMusic
	}
];
const HOT_SEARCHES = [
	"初音未来",
	"千本樱",
	"鳳凰伝",
	"マトリョシカ",
	"ロストワンの号哭",
	"ドーナツホール",
	"神っぽいな",
	"ダーリンダンス",
	"ロキ",
	"エゴロック"
];
const HISTORY_KEY = "netease-search-history";
function fmtDur(ms) {
	if (!ms) return "—";
	const s = Math.round(ms / 1e3);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtNum(n) {
	if (n == null) return "—";
	if (n >= 1e7) return `${(n / 1e7).toFixed(1)}000万`;
	if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
	return n.toLocaleString();
}
function neteaseUrl(kind, id) {
	const path = {
		song: "song",
		artist: "artist",
		album: "album",
		playlist: "playlist"
	};
	return `https://music.163.com/#/${path[kind] ?? "search"}?id=${id}`;
}
function popPercent(pop) {
	return Math.max(0, Math.min(100, pop ?? 0));
}
export default function Netease() {
	_s();
	const [kw, setKw] = useState("");
	const [type, setType] = useState("song");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [searched, setSearched] = useState(false);
	const [active, setActive] = useState(null);
	const [detail, setDetail] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [history, setHistory] = useState([]);
	const [sort, setSort] = useState("default");
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		try {
			const raw = localStorage.getItem(HISTORY_KEY);
			if (raw) setHistory(JSON.parse(raw));
		} catch {}
	}, []);
	function saveHistory(keyword) {
		if (!keyword.trim()) return;
		setHistory((prev) => {
			const next = [keyword.trim(), ...prev.filter((h) => h !== keyword.trim())].slice(0, 12);
			try {
				localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
			} catch {}
			return next;
		});
	}
	function clearHistory() {
		setHistory([]);
		try {
			localStorage.removeItem(HISTORY_KEY);
		} catch {}
	}
	function doSearch() {
		const k = kw.trim();
		if (!k) return;
		setLoading(true);
		setError(null);
		setSearched(true);
		setActive(null);
		setDetail(null);
		saveHistory(k);
		api.neteaseSearch(k, 30, type).then((r) => setItems(r.items)).catch((e) => {
			setError(e?.message ?? String(e));
			setItems([]);
		}).finally(() => setLoading(false));
	}
	function openItem(it) {
		setActive(it);
		if (it.kind === "song") {
			setDetailLoading(true);
			setDetail(null);
			api.neteaseSong(it.id).then((d) => setDetail(d)).catch((e) => setError(e?.message ?? String(e))).finally(() => setDetailLoading(false));
		} else {
			setDetail(null);
		}
	}
	function closeDetail() {
		setActive(null);
		setDetail(null);
	}
	const sortedItems = useMemo(() => {
		if (sort === "default") return items;
		const arr = [...items];
		if (sort === "pop") {
			return arr.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
		}
		return arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
	}, [items, sort]);
	const typeLabel = TYPES.find((t) => t.key === type)?.label ?? "";
	const typeIcon = TYPES.find((t) => t.key === type)?.icon ?? Music2;
	return /* @__PURE__ */ _jsxDEV(_Fragment, { children: [
		/* @__PURE__ */ _jsxDEV("div", {
			className: "topbar",
			children: [/* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("div", {
				className: "crumb",
				children: "网易云音乐 · 搜索"
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 138,
				columnNumber: 11
			}, this), /* @__PURE__ */ _jsxDEV("h1", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 10
				},
				children: [/* @__PURE__ */ _jsxDEV(Music2, {
					size: 26,
					style: { color: "var(--accent)" }
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 140,
					columnNumber: 13
				}, this), "网易云搜索"]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 139,
				columnNumber: 11
			}, this)] }, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 137,
				columnNumber: 9
			}, this), /* @__PURE__ */ _jsxDEV("div", {
				style: {
					display: "flex",
					gap: 8,
					flexWrap: "wrap"
				},
				children: [/* @__PURE__ */ _jsxDEV("span", {
					style: badgeStyle,
					children: [/* @__PURE__ */ _jsxDEV(Sparkles, { size: 12 }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 145,
						columnNumber: 36
					}, this), " 公开接口"]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 145,
					columnNumber: 11
				}, this), /* @__PURE__ */ _jsxDEV("span", {
					style: badgeStyle,
					children: [/* @__PURE__ */ _jsxDEV(Flame, { size: 12 }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 146,
						columnNumber: 36
					}, this), " 无需登录"]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 146,
					columnNumber: 11
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 144,
				columnNumber: 9
			}, this)]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 136,
			columnNumber: 7
		}, this),
		/* @__PURE__ */ _jsxDEV("div", {
			style: searchBoxStyle,
			children: [/* @__PURE__ */ _jsxDEV("div", {
				style: {
					display: "flex",
					gap: 10,
					flexWrap: "wrap"
				},
				children: [
					/* @__PURE__ */ _jsxDEV("input", {
						value: kw,
						onChange: (e) => setKw(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Enter") doSearch();
						},
						placeholder: "输入歌名 / 歌手 / 专辑 / 歌单…",
						style: inputStyle
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 153,
						columnNumber: 11
					}, this),
					/* @__PURE__ */ _jsxDEV("select", {
						value: type,
						onChange: (e) => setType(e.target.value),
						style: selectStyle,
						children: TYPES.map((t) => /* @__PURE__ */ _jsxDEV("option", {
							value: t.key,
							children: t.label
						}, t.key, false, {
							fileName: _jsxFileName,
							lineNumber: 162,
							columnNumber: 15
						}, this))
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 160,
						columnNumber: 11
					}, this),
					/* @__PURE__ */ _jsxDEV("button", {
						onClick: doSearch,
						style: btnStyle,
						disabled: loading,
						children: [loading ? /* @__PURE__ */ _jsxDEV(Spinner, { size: 14 }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 166,
							columnNumber: 24
						}, this) : /* @__PURE__ */ _jsxDEV(SearchIcon, { size: 14 }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 166,
							columnNumber: 48
						}, this), /* @__PURE__ */ _jsxDEV("span", { children: "搜索" }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 167,
							columnNumber: 13
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 165,
						columnNumber: 11
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 152,
				columnNumber: 9
			}, this), /* @__PURE__ */ _jsxDEV("div", {
				style: {
					marginTop: 14,
					display: "flex",
					flexDirection: "column",
					gap: 10
				},
				children: [/* @__PURE__ */ _jsxDEV("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap"
					},
					children: [/* @__PURE__ */ _jsxDEV("span", {
						style: {
							fontSize: 12,
							color: "var(--text-dim)",
							display: "inline-flex",
							alignItems: "center",
							gap: 4
						},
						children: [/* @__PURE__ */ _jsxDEV(Flame, { size: 12 }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 175,
							columnNumber: 15
						}, this), " 热门搜索"]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 174,
						columnNumber: 13
					}, this), HOT_SEARCHES.map((h) => /* @__PURE__ */ _jsxDEV("button", {
						style: chipStyle,
						onClick: () => {
							setKw(h);
							doSearch();
						},
						children: h
					}, h, false, {
						fileName: _jsxFileName,
						lineNumber: 178,
						columnNumber: 15
					}, this))]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 173,
					columnNumber: 11
				}, this), history.length > 0 && /* @__PURE__ */ _jsxDEV("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap"
					},
					children: [
						/* @__PURE__ */ _jsxDEV("span", {
							style: {
								fontSize: 12,
								color: "var(--text-dim)",
								display: "inline-flex",
								alignItems: "center",
								gap: 4
							},
							children: [/* @__PURE__ */ _jsxDEV(History, { size: 12 }, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 184,
								columnNumber: 17
							}, this), " 搜索历史"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 183,
							columnNumber: 15
						}, this),
						history.map((h) => /* @__PURE__ */ _jsxDEV("button", {
							style: chipStyle,
							onClick: () => {
								setKw(h);
								doSearch();
							},
							children: h
						}, h, false, {
							fileName: _jsxFileName,
							lineNumber: 187,
							columnNumber: 17
						}, this)),
						/* @__PURE__ */ _jsxDEV("button", {
							style: {
								...chipStyle,
								color: "var(--danger)"
							},
							onClick: clearHistory,
							title: "清空历史",
							children: /* @__PURE__ */ _jsxDEV(Trash2, { size: 12 }, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 190,
								columnNumber: 17
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 189,
							columnNumber: 15
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 182,
					columnNumber: 13
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 172,
				columnNumber: 9
			}, this)]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 151,
			columnNumber: 7
		}, this),
		/* @__PURE__ */ _jsxDEV("div", {
			style: {
				fontSize: 12.5,
				color: "var(--text-dim)",
				margin: "14px 0 18px",
				lineHeight: 1.6
			},
			children: [
				/* @__PURE__ */ _jsxDEV(AlertCircle, {
					size: 13,
					style: {
						verticalAlign: "-2px",
						marginRight: 5
					}
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 199,
					columnNumber: 9
				}, this),
				"数据来自网易云公开接口。",
				/* @__PURE__ */ _jsxDEV("b", { children: "播放量" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 200,
					columnNumber: 21
				}, this),
				"接口已关闭，单曲详情以",
				/* @__PURE__ */ _jsxDEV("b", { children: "热度 / 评论数" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 200,
					columnNumber: 42
				}, this),
				"为准；搜索结果中点击单曲可加载详情封面。"
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 198,
			columnNumber: 7
		}, this),
		error && /* @__PURE__ */ _jsxDEV("div", {
			style: {
				...bannerStyle,
				background: "color-mix(in srgb, var(--danger) 12%, transparent)",
				color: "var(--danger)",
				marginBottom: 16
			},
			children: [
				/* @__PURE__ */ _jsxDEV(AlertCircle, { size: 16 }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 205,
					columnNumber: 11
				}, this),
				" ",
				error
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 204,
			columnNumber: 9
		}, this),
		loading && /* @__PURE__ */ _jsxDEV("div", {
			style: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
				gap: 14
			},
			children: Array.from({ length: 8 }).map((_, i) => /* @__PURE__ */ _jsxDEV(SkeletonCard, {}, i, false, {
				fileName: _jsxFileName,
				lineNumber: 211,
				columnNumber: 52
			}, this))
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 210,
			columnNumber: 9
		}, this),
		!loading && searched && items.length === 0 && /* @__PURE__ */ _jsxDEV(Empty, { label: `未找到「${kw}」相关${typeLabel}，试试切换类型或换个关键词` }, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 216,
			columnNumber: 9
		}, this),
		!loading && items.length > 0 && /* @__PURE__ */ _jsxDEV(_Fragment, { children: [/* @__PURE__ */ _jsxDEV("div", {
			style: toolbarStyle,
			children: [/* @__PURE__ */ _jsxDEV("div", {
				style: {
					fontSize: 13,
					color: "var(--text-dim)",
					display: "flex",
					alignItems: "center",
					gap: 8
				},
				children: [
					/* @__PURE__ */ _jsxDEV(Hash, { size: 13 }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 223,
						columnNumber: 15
					}, this),
					"共 ",
					/* @__PURE__ */ _jsxDEV("b", {
						style: { color: "var(--text)" },
						children: items.length
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 224,
						columnNumber: 17
					}, this),
					" 个",
					typeLabel,
					"结果"
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 222,
				columnNumber: 13
			}, this), /* @__PURE__ */ _jsxDEV("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8
				},
				children: [/* @__PURE__ */ _jsxDEV(ArrowUpDown, {
					size: 13,
					style: { color: "var(--text-dim)" }
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 227,
					columnNumber: 15
				}, this), /* @__PURE__ */ _jsxDEV("select", {
					value: sort,
					onChange: (e) => setSort(e.target.value),
					style: sortSelectStyle,
					children: [
						/* @__PURE__ */ _jsxDEV("option", {
							value: "default",
							children: "默认排序"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 229,
							columnNumber: 17
						}, this),
						/* @__PURE__ */ _jsxDEV("option", {
							value: "pop",
							children: "热度优先"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 230,
							columnNumber: 17
						}, this),
						/* @__PURE__ */ _jsxDEV("option", {
							value: "name",
							children: "名称排序"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 231,
							columnNumber: 17
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 228,
					columnNumber: 15
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 226,
				columnNumber: 13
			}, this)]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 221,
			columnNumber: 11
		}, this), /* @__PURE__ */ _jsxDEV("div", {
			style: gridStyle,
			children: sortedItems.map((it) => /* @__PURE__ */ _jsxDEV(ResultCard, {
				it,
				active: active?.id === it.id && active?.kind === it.kind,
				onClick: () => openItem(it)
			}, `${it.kind}-${it.id}`, false, {
				fileName: _jsxFileName,
				lineNumber: 238,
				columnNumber: 15
			}, this))
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 236,
			columnNumber: 11
		}, this)] }, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 220,
			columnNumber: 9
		}, this),
		!loading && !searched && /* @__PURE__ */ _jsxDEV("div", {
			style: placeholderStyle,
			children: [
				/* @__PURE__ */ _jsxDEV(Music2, {
					size: 56,
					style: {
						color: "var(--text-faint)",
						opacity: .6
					}
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 251,
					columnNumber: 11
				}, this),
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						marginTop: 14,
						fontSize: 15,
						color: "var(--text-dim)"
					},
					children: "输入关键词，开始探索网易云音乐"
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 252,
					columnNumber: 11
				}, this),
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						marginTop: 6,
						fontSize: 12,
						color: "var(--text-faint)"
					},
					children: "支持单曲、歌手、专辑、歌单四类搜索"
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 255,
					columnNumber: 11
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 250,
			columnNumber: 9
		}, this),
		active && /* @__PURE__ */ _jsxDEV(DetailPanel, {
			active,
			detail,
			detailLoading,
			typeLabel,
			related: sortedItems.filter((x) => x.id !== active.id).slice(0, 6),
			onClose: closeDetail,
			onOpenItem: openItem,
			copied,
			onCopy: () => {
				navigator.clipboard.writeText(neteaseUrl(active.kind, active.id)).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 263,
			columnNumber: 9
		}, this)
	] }, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 134,
		columnNumber: 5
	}, this);
}
_s(Netease, "ql0dDD/0zkHa2nl0O4xq4ORl/DI=");
_c = Netease;
function ResultCard({ it, active, onClick }) {
	const Icon = it.kind === "artist" ? Mic2 : it.kind === "album" ? Disc : it.kind === "playlist" ? ListMusic : Music2;
	return /* @__PURE__ */ _jsxDEV("div", {
		style: cardStyle(active),
		onClick,
		children: [/* @__PURE__ */ _jsxDEV("div", {
			style: picWrapStyle,
			children: [
				it.pic ? /* @__PURE__ */ _jsxDEV("img", {
					src: it.pic,
					alt: it.name,
					style: picStyle,
					loading: "lazy"
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 290,
					columnNumber: 13
				}, this) : /* @__PURE__ */ _jsxDEV("div", {
					style: picPlaceholderStyle,
					children: /* @__PURE__ */ _jsxDEV(Icon, { size: 34 }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 291,
						columnNumber: 46
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 291,
					columnNumber: 13
				}, this),
				it.kind === "song" && it.duration_ms ? /* @__PURE__ */ _jsxDEV("span", {
					style: durationBadgeStyle,
					children: [
						/* @__PURE__ */ _jsxDEV(Clock, { size: 10 }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 293,
							columnNumber: 44
						}, this),
						" ",
						fmtDur(it.duration_ms)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 293,
					columnNumber: 11
				}, this) : null,
				it.kind === "song" && it.mv_id ? /* @__PURE__ */ _jsxDEV("span", {
					style: mvBadgeStyle,
					children: [/* @__PURE__ */ _jsxDEV(PlayCircle, { size: 10 }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 296,
						columnNumber: 38
					}, this), " MV"]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 296,
					columnNumber: 11
				}, this) : null
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 288,
			columnNumber: 7
		}, this), /* @__PURE__ */ _jsxDEV("div", {
			style: {
				marginTop: 10,
				minHeight: 0
			},
			children: [
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						fontWeight: 700,
						fontSize: 14.5,
						lineHeight: 1.35,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: it.name
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 301,
					columnNumber: 9
				}, this),
				it.kind === "song" && it.alias && it.alias.length > 0 && /* @__PURE__ */ _jsxDEV("div", {
					style: {
						display: "flex",
						gap: 4,
						marginTop: 5,
						flexWrap: "wrap"
					},
					children: it.alias.slice(0, 2).map((a, i) => /* @__PURE__ */ _jsxDEV("span", {
						style: tagStyle,
						children: a
					}, i, false, {
						fileName: _jsxFileName,
						lineNumber: 308,
						columnNumber: 15
					}, this))
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 306,
					columnNumber: 11
				}, this),
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						fontSize: 12.5,
						color: "var(--text-dim)",
						marginTop: 5,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: it.kind === "song" && it.album ? `${it.sub} · 《${it.album}》` : it.sub
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 313,
					columnNumber: 9
				}, this),
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						marginTop: 8,
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap"
					},
					children: [
						it.kind === "song" && it.pop != null && /* @__PURE__ */ _jsxDEV("div", {
							style: {
								flex: 1,
								minWidth: 60
							},
							children: [/* @__PURE__ */ _jsxDEV("div", {
								style: {
									height: 4,
									background: "var(--bg-soft)",
									borderRadius: 2,
									overflow: "hidden"
								},
								children: /* @__PURE__ */ _jsxDEV("div", { style: {
									width: `${popPercent(it.pop)}%`,
									height: "100%",
									background: "var(--accent)",
									borderRadius: 2
								} }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 321,
									columnNumber: 17
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 320,
								columnNumber: 15
							}, this), /* @__PURE__ */ _jsxDEV("div", {
								style: {
									fontSize: 10.5,
									color: "var(--text-faint)",
									marginTop: 2
								},
								children: ["热度 ", it.pop]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 323,
								columnNumber: 15
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 319,
							columnNumber: 13
						}, this),
						it.kind === "artist" && it.music_size != null && /* @__PURE__ */ _jsxDEV("span", {
							style: metaStyle,
							children: [
								/* @__PURE__ */ _jsxDEV(Music2, { size: 11 }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 327,
									columnNumber: 37
								}, this),
								" ",
								it.music_size,
								" 首"
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 327,
							columnNumber: 13
						}, this),
						it.kind === "album" && it.size != null && /* @__PURE__ */ _jsxDEV("span", {
							style: metaStyle,
							children: [
								/* @__PURE__ */ _jsxDEV(Disc, { size: 11 }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 330,
									columnNumber: 37
								}, this),
								" ",
								it.size,
								" 首"
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 330,
							columnNumber: 13
						}, this),
						it.kind === "playlist" && it.track_count != null && /* @__PURE__ */ _jsxDEV("span", {
							style: metaStyle,
							children: [
								/* @__PURE__ */ _jsxDEV(ListMusic, { size: 11 }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 333,
									columnNumber: 37
								}, this),
								" ",
								it.track_count,
								" 首"
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 333,
							columnNumber: 13
						}, this),
						it.kind === "playlist" && it.play_count != null && /* @__PURE__ */ _jsxDEV("span", {
							style: metaStyle,
							children: [
								/* @__PURE__ */ _jsxDEV(TrendingUp, { size: 11 }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 336,
									columnNumber: 37
								}, this),
								" ",
								fmtNum(it.play_count)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 336,
							columnNumber: 13
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 317,
					columnNumber: 9
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 300,
			columnNumber: 7
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 287,
		columnNumber: 5
	}, this);
}
_c2 = ResultCard;
function DetailPanel({ active, detail, detailLoading, typeLabel, related, onClose, onOpenItem, copied, onCopy }) {
	const isSong = active.kind === "song";
	const cover = detail?.album_pic || active.pic;
	const statCards = [
		{
			icon: Flame,
			label: "热度",
			value: detail?.pop ?? active.pop ?? "—"
		},
		{
			icon: MessageCircle,
			label: "评论数",
			value: fmtNum(detail?.comment_count)
		},
		{
			icon: Heart,
			label: "播放量",
			value: "网易云未公开"
		},
		{
			icon: Clock,
			label: "时长",
			value: fmtDur(detail?.duration_ms ?? active.duration_ms)
		}
	];
	return /* @__PURE__ */ _jsxDEV("div", {
		style: modalOverlayStyle,
		onClick: (e) => {
			if (e.target === e.currentTarget) onClose();
		},
		children: /* @__PURE__ */ _jsxDEV("div", {
			style: modalPanelStyle,
			children: [
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						gap: 12,
						marginBottom: 16
					},
					children: [/* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("div", {
						style: {
							fontSize: 12,
							color: "var(--text-faint)",
							marginBottom: 4
						},
						children: ["网易云 · ", typeLabel]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 371,
						columnNumber: 13
					}, this), /* @__PURE__ */ _jsxDEV("h2", {
						style: {
							margin: 0,
							fontSize: 20,
							lineHeight: 1.3
						},
						children: active.name
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 372,
						columnNumber: 13
					}, this)] }, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 370,
						columnNumber: 11
					}, this), /* @__PURE__ */ _jsxDEV("button", {
						onClick: onClose,
						style: iconBtnStyle,
						title: "关闭",
						children: /* @__PURE__ */ _jsxDEV(X, { size: 18 }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 374,
							columnNumber: 69
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 374,
						columnNumber: 11
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 369,
					columnNumber: 9
				}, this),
				/* @__PURE__ */ _jsxDEV("div", {
					style: {
						display: "flex",
						gap: 20,
						flexWrap: "wrap"
					},
					children: [/* @__PURE__ */ _jsxDEV("div", {
						style: { flexShrink: 0 },
						children: /* @__PURE__ */ _jsxDEV("div", {
							style: {
								...coverWrapStyle,
								backgroundImage: cover ? `url(${cover})` : undefined
							},
							children: !cover && /* @__PURE__ */ _jsxDEV(Music2, {
								size: 52,
								style: { color: "var(--text-faint)" }
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 380,
								columnNumber: 26
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 379,
							columnNumber: 13
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 378,
						columnNumber: 11
					}, this), /* @__PURE__ */ _jsxDEV("div", {
						style: {
							flex: 1,
							minWidth: 240
						},
						children: [
							detail?.alias && detail.alias.length > 0 && /* @__PURE__ */ _jsxDEV("div", {
								style: {
									display: "flex",
									gap: 6,
									flexWrap: "wrap",
									marginBottom: 10
								},
								children: detail.alias.map((a, i) => /* @__PURE__ */ _jsxDEV("span", {
									style: tagStyle,
									children: a
								}, i, false, {
									fileName: _jsxFileName,
									lineNumber: 387,
									columnNumber: 45
								}, this))
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 386,
								columnNumber: 15
							}, this),
							/* @__PURE__ */ _jsxDEV("div", {
								style: {
									fontSize: 14,
									color: "var(--text-dim)",
									marginBottom: 12
								},
								children: isSong ? /* @__PURE__ */ _jsxDEV(_Fragment, { children: [/* @__PURE__ */ _jsxDEV("span", {
									style: {
										display: "inline-flex",
										alignItems: "center",
										gap: 4
									},
									children: [
										/* @__PURE__ */ _jsxDEV(Mic2, { size: 13 }, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 394,
											columnNumber: 90
										}, this),
										" ",
										detail?.artists?.join(" / ") || active.sub
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 394,
									columnNumber: 19
								}, this), detail?.album && /* @__PURE__ */ _jsxDEV("span", {
									style: { marginLeft: 10 },
									children: [
										/* @__PURE__ */ _jsxDEV(Disc, {
											size: 13,
											style: { verticalAlign: "-2px" }
										}, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 395,
											columnNumber: 70
										}, this),
										" 《",
										detail.album,
										"》"
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 395,
									columnNumber: 37
								}, this)] }, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 393,
									columnNumber: 17
								}, this) : /* @__PURE__ */ _jsxDEV("span", { children: active.sub }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 398,
									columnNumber: 17
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 391,
								columnNumber: 13
							}, this),
							isSong && detail?.pop != null && /* @__PURE__ */ _jsxDEV("div", {
								style: { marginBottom: 14 },
								children: [/* @__PURE__ */ _jsxDEV("div", {
									style: {
										display: "flex",
										justifyContent: "space-between",
										fontSize: 12,
										color: "var(--text-dim)",
										marginBottom: 4
									},
									children: [/* @__PURE__ */ _jsxDEV("span", { children: "热度指数" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 405,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("span", { children: [detail.pop, " / 100"] }, void 0, true, {
										fileName: _jsxFileName,
										lineNumber: 406,
										columnNumber: 19
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 404,
									columnNumber: 17
								}, this), /* @__PURE__ */ _jsxDEV("div", {
									style: {
										height: 8,
										background: "var(--bg-soft)",
										borderRadius: 4,
										overflow: "hidden"
									},
									children: /* @__PURE__ */ _jsxDEV("div", { style: {
										width: `${popPercent(detail.pop)}%`,
										height: "100%",
										background: "linear-gradient(90deg, var(--accent), #ff7eb3)",
										borderRadius: 4
									} }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 409,
										columnNumber: 19
									}, this)
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 408,
									columnNumber: 17
								}, this)]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 403,
								columnNumber: 15
							}, this),
							detailLoading && /* @__PURE__ */ _jsxDEV(Spinner, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 414,
								columnNumber: 31
							}, this),
							isSong && detail && /* @__PURE__ */ _jsxDEV("div", {
								style: statsGridStyle,
								children: statCards.map((s, i) => /* @__PURE__ */ _jsxDEV("div", {
									style: statCardStyle,
									children: [
										/* @__PURE__ */ _jsxDEV(s.icon, {
											size: 16,
											style: { color: "var(--accent)" }
										}, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 420,
											columnNumber: 21
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											style: {
												fontSize: 15,
												fontWeight: 700,
												marginTop: 4
											},
											children: s.value
										}, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 421,
											columnNumber: 21
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											style: {
												fontSize: 11,
												color: "var(--text-faint)"
											},
											children: s.label
										}, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 422,
											columnNumber: 21
										}, this)
									]
								}, i, true, {
									fileName: _jsxFileName,
									lineNumber: 419,
									columnNumber: 19
								}, this))
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 417,
								columnNumber: 15
							}, this),
							!isSong && /* @__PURE__ */ _jsxDEV("div", {
								style: {
									padding: 14,
									background: "var(--bg-soft)",
									borderRadius: 12,
									color: "var(--text-dim)",
									fontSize: 13
								},
								children: [
									"点击「在网易云打开」查看完整",
									typeLabel,
									"页面。"
								]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 429,
								columnNumber: 15
							}, this),
							/* @__PURE__ */ _jsxDEV("div", {
								style: {
									display: "flex",
									gap: 10,
									marginTop: 16,
									flexWrap: "wrap"
								},
								children: [/* @__PURE__ */ _jsxDEV("a", {
									href: neteaseUrl(active.kind, active.id),
									target: "_blank",
									rel: "noreferrer",
									style: {
										...primaryBtnStyle,
										display: "inline-flex",
										alignItems: "center",
										gap: 6
									},
									children: [/* @__PURE__ */ _jsxDEV(ExternalLink, { size: 14 }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 441,
										columnNumber: 17
									}, this), " 在网易云打开"]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 435,
									columnNumber: 15
								}, this), /* @__PURE__ */ _jsxDEV("button", {
									onClick: onCopy,
									style: {
										...secondaryBtnStyle,
										display: "inline-flex",
										alignItems: "center",
										gap: 6
									},
									children: [copied ? /* @__PURE__ */ _jsxDEV(Check, { size: 14 }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 444,
										columnNumber: 27
									}, this) : /* @__PURE__ */ _jsxDEV(Copy, { size: 14 }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 444,
										columnNumber: 49
									}, this), copied ? "已复制" : "复制链接"]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 443,
									columnNumber: 15
								}, this)]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 434,
								columnNumber: 13
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 384,
						columnNumber: 11
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 377,
					columnNumber: 9
				}, this),
				related.length > 0 && /* @__PURE__ */ _jsxDEV("div", {
					style: { marginTop: 24 },
					children: [/* @__PURE__ */ _jsxDEV("div", {
						style: {
							fontSize: 14,
							fontWeight: 700,
							marginBottom: 12,
							display: "flex",
							alignItems: "center",
							gap: 6
						},
						children: [/* @__PURE__ */ _jsxDEV(Sparkles, {
							size: 14,
							style: { color: "var(--accent)" }
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 454,
							columnNumber: 15
						}, this), " 相关推荐"]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 453,
						columnNumber: 13
					}, this), /* @__PURE__ */ _jsxDEV("div", {
						style: {
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
							gap: 10
						},
						children: related.map((it) => /* @__PURE__ */ _jsxDEV("div", {
							style: relatedCardStyle,
							onClick: () => onOpenItem(it),
							children: [
								/* @__PURE__ */ _jsxDEV("div", {
									style: {
										...relatedPicStyle,
										backgroundImage: it.pic ? `url(${it.pic})` : undefined
									},
									children: !it.pic && /* @__PURE__ */ _jsxDEV(Music2, {
										size: 18,
										style: { color: "var(--text-faint)" }
									}, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 464,
										columnNumber: 33
									}, this)
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 463,
									columnNumber: 19
								}, this),
								/* @__PURE__ */ _jsxDEV("div", {
									style: {
										fontSize: 12.5,
										fontWeight: 600,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: it.name
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 466,
									columnNumber: 19
								}, this),
								/* @__PURE__ */ _jsxDEV("div", {
									style: {
										fontSize: 11,
										color: "var(--text-faint)",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: it.sub
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 467,
									columnNumber: 19
								}, this)
							]
						}, `rel-${it.kind}-${it.id}`, true, {
							fileName: _jsxFileName,
							lineNumber: 458,
							columnNumber: 17
						}, this))
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 456,
						columnNumber: 13
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 452,
					columnNumber: 11
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 368,
			columnNumber: 7
		}, this)
	}, void 0, false, {
		fileName: _jsxFileName,
		lineNumber: 367,
		columnNumber: 5
	}, this);
}
_c3 = DetailPanel;
function SkeletonCard() {
	return /* @__PURE__ */ _jsxDEV("div", {
		style: {
			background: "var(--bg-card)",
			border: "1px solid var(--border)",
			borderRadius: 14,
			padding: 14
		},
		children: [
			/* @__PURE__ */ _jsxDEV("div", { style: {
				width: "100%",
				aspectRatio: "1 / 1",
				borderRadius: 10,
				background: "var(--bg-soft)"
			} }, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 481,
				columnNumber: 7
			}, this),
			/* @__PURE__ */ _jsxDEV("div", { style: {
				height: 16,
				borderRadius: 4,
				background: "var(--bg-soft)",
				marginTop: 12,
				width: "70%"
			} }, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 482,
				columnNumber: 7
			}, this),
			/* @__PURE__ */ _jsxDEV("div", { style: {
				height: 12,
				borderRadius: 4,
				background: "var(--bg-soft)",
				marginTop: 8,
				width: "45%"
			} }, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 483,
				columnNumber: 7
			}, this),
			/* @__PURE__ */ _jsxDEV("div", { style: {
				height: 4,
				borderRadius: 2,
				background: "var(--bg-soft)",
				marginTop: 12
			} }, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 484,
				columnNumber: 7
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 480,
		columnNumber: 5
	}, this);
}
_c4 = SkeletonCard;
const searchBoxStyle = {
	background: "var(--bg-card)",
	border: "1px solid var(--border)",
	borderRadius: 16,
	padding: "16px",
	margin: "4px 0 0"
};
const inputStyle = {
	flex: 1,
	minWidth: 240,
	padding: "11px 14px",
	borderRadius: 12,
	border: "1px solid var(--border)",
	background: "var(--bg-elev)",
	color: "var(--text)",
	fontSize: 14,
	outline: "none",
	transition: "border .15s"
};
const selectStyle = {
	padding: "11px 14px",
	borderRadius: 12,
	border: "1px solid var(--border)",
	background: "var(--bg-elev)",
	color: "var(--text)",
	fontSize: 14,
	cursor: "pointer"
};
const sortSelectStyle = {
	padding: "6px 10px",
	borderRadius: 8,
	border: "1px solid var(--border)",
	background: "var(--bg-elev)",
	color: "var(--text)",
	fontSize: 12.5,
	cursor: "pointer"
};
const btnStyle = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 6,
	padding: "11px 22px",
	borderRadius: 12,
	border: "none",
	background: "var(--accent)",
	color: "#fff",
	fontWeight: 700,
	cursor: "pointer",
	fontSize: 14,
	minWidth: 92
};
const chipStyle = {
	fontSize: 12.5,
	padding: "5px 11px",
	borderRadius: 20,
	border: "1px solid var(--border)",
	background: "var(--bg-elev)",
	color: "var(--text-dim)",
	cursor: "pointer",
	transition: "all .12s"
};
const badgeStyle = {
	display: "inline-flex",
	alignItems: "center",
	gap: 5,
	fontSize: 11.5,
	padding: "5px 10px",
	borderRadius: 20,
	background: "var(--bg-soft)",
	color: "var(--text-dim)",
	border: "1px solid var(--border)"
};
const bannerStyle = {
	display: "inline-flex",
	alignItems: "center",
	gap: 8,
	padding: "10px 14px",
	borderRadius: 12,
	fontSize: 13
};
const toolbarStyle = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginBottom: 14,
	flexWrap: "wrap",
	gap: 10
};
const gridStyle = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
	gap: 14
};
function cardStyle(active) {
	return {
		background: "var(--bg-card)",
		border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
		borderRadius: 16,
		padding: 14,
		cursor: "pointer",
		transition: "transform .12s, box-shadow .12s, border-color .12s",
		boxShadow: active ? "0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)" : undefined
	};
}
const picWrapStyle = {
	width: "100%",
	aspectRatio: "1 / 1",
	borderRadius: 12,
	overflow: "hidden",
	background: "var(--bg-soft)",
	position: "relative"
};
const picStyle = {
	width: "100%",
	height: "100%",
	objectFit: "cover",
	display: "block"
};
const picPlaceholderStyle = {
	width: "100%",
	height: "100%",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	color: "var(--text-faint)",
	background: "var(--bg-soft)"
};
const durationBadgeStyle = {
	position: "absolute",
	bottom: 8,
	right: 8,
	fontSize: 11,
	background: "rgba(0,0,0,0.65)",
	color: "#fff",
	padding: "2px 7px",
	borderRadius: 6,
	display: "inline-flex",
	alignItems: "center",
	gap: 3
};
const mvBadgeStyle = {
	position: "absolute",
	top: 8,
	left: 8,
	fontSize: 11,
	background: "var(--accent)",
	color: "#fff",
	padding: "2px 7px",
	borderRadius: 6,
	display: "inline-flex",
	alignItems: "center",
	gap: 3
};
const tagStyle = {
	fontSize: 10.5,
	padding: "2px 7px",
	borderRadius: 6,
	background: "var(--bg-soft)",
	color: "var(--text-dim)",
	border: "1px solid var(--border)"
};
const metaStyle = {
	fontSize: 11,
	color: "var(--text-faint)",
	display: "inline-flex",
	alignItems: "center",
	gap: 3
};
const placeholderStyle = {
	marginTop: 40,
	textAlign: "center",
	padding: "40px 20px",
	borderRadius: 18,
	border: "1px dashed var(--border)",
	background: "var(--bg-card)"
};
const modalOverlayStyle = {
	position: "fixed",
	inset: 0,
	zIndex: 100,
	background: "rgba(0,0,0,0.45)",
	backdropFilter: "blur(4px)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: 20,
	overflow: "auto"
};
const modalPanelStyle = {
	background: "var(--bg-card)",
	border: "1px solid var(--border)",
	borderRadius: 20,
	padding: "22px",
	width: "100%",
	maxWidth: 720,
	maxHeight: "90vh",
	overflow: "auto",
	boxShadow: "0 20px 60px rgba(0,0,0,0.25)"
};
const coverWrapStyle = {
	width: 200,
	height: 200,
	borderRadius: 16,
	overflow: "hidden",
	background: "var(--bg-soft) center/cover",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	boxShadow: "0 8px 30px rgba(0,0,0,0.12)"
};
const statsGridStyle = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
	gap: 10
};
const statCardStyle = {
	background: "var(--bg-elev)",
	border: "1px solid var(--border)",
	borderRadius: 12,
	padding: "12px",
	textAlign: "center"
};
const primaryBtnStyle = {
	padding: "10px 16px",
	borderRadius: 10,
	background: "var(--accent)",
	color: "#fff",
	fontWeight: 700,
	fontSize: 13,
	textDecoration: "none"
};
const secondaryBtnStyle = {
	padding: "10px 16px",
	borderRadius: 10,
	background: "var(--bg-elev)",
	color: "var(--text)",
	fontWeight: 600,
	fontSize: 13,
	border: "1px solid var(--border)",
	cursor: "pointer"
};
const iconBtnStyle = {
	width: 34,
	height: 34,
	borderRadius: 10,
	border: "1px solid var(--border)",
	background: "var(--bg-elev)",
	color: "var(--text)",
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center"
};
const relatedCardStyle = {
	background: "var(--bg-elev)",
	border: "1px solid var(--border)",
	borderRadius: 12,
	padding: 10,
	cursor: "pointer",
	transition: "border-color .12s"
};
const relatedPicStyle = {
	width: "100%",
	aspectRatio: "1 / 1",
	borderRadius: 8,
	overflow: "hidden",
	background: "var(--bg-soft) center/cover",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	marginBottom: 8
};
var _c, _c2, _c3, _c4;
$RefreshReg$(_c, "Netease");
$RefreshReg$(_c2, "ResultCard");
$RefreshReg$(_c3, "DetailPanel");
$RefreshReg$(_c4, "SkeletonCard");
import * as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
import * as __vite_react_currentExports from "/src/pages/Netease.tsx?t=1786327624740";
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong."
    );
  }

  const currentExports = __vite_react_currentExports;
  queueMicrotask(() => {
    RefreshRuntime.registerExportsForReactRefresh("D:/DeepSeek前端代码/前端/未确定/术力口周榜/术力口/frontend/src/pages/Netease.tsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("D:/DeepSeek前端代码/前端/未确定/术力口周榜/术力口/frontend/src/pages/Netease.tsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}
function $RefreshReg$(type, id) { return RefreshRuntime.register(type, "D:/DeepSeek前端代码/前端/未确定/术力口周榜/术力口/frontend/src/pages/Netease.tsx" + ' ' + id); }
function $RefreshSig$() { return RefreshRuntime.createSignatureFunctionForTransform(); }

//# sourceMappingURL=data:application/json;base64,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QVUsZ0JBQWdCO0NBQ2xHLFdBQVc7QUFDYjtBQUVBLE1BQU0saUJBQWdDO0NBQ3BDLFNBQVM7Q0FBUSxxQkFBcUI7Q0FBeUMsS0FBSztBQUN0RjtBQUVBLE1BQU0sZ0JBQStCO0NBQ25DLFlBQVk7Q0FBa0IsUUFBUTtDQUEyQixjQUFjO0NBQy9FLFNBQVM7Q0FBUSxXQUFXO0FBQzlCO0FBRUEsTUFBTSxrQkFBaUM7Q0FDckMsU0FBUztDQUFhLGNBQWM7Q0FBSSxZQUFZO0NBQWlCLE9BQU87Q0FDNUUsWUFBWTtDQUFLLFVBQVU7Q0FBSSxnQkFBZ0I7QUFDakQ7QUFFQSxNQUFNLG9CQUFtQztDQUN2QyxTQUFTO0NBQWEsY0FBYztDQUFJLFlBQVk7Q0FBa0IsT0FBTztDQUM3RSxZQUFZO0NBQUssVUFBVTtDQUFJLFFBQVE7Q0FBMkIsUUFBUTtBQUM1RTtBQUVBLE1BQU0sZUFBOEI7Q0FDbEMsT0FBTztDQUFJLFFBQVE7Q0FBSSxjQUFjO0NBQUksUUFBUTtDQUNqRCxZQUFZO0NBQWtCLE9BQU87Q0FBZSxRQUFRO0NBQzVELFNBQVM7Q0FBZSxZQUFZO0NBQVUsZ0JBQWdCO0FBQ2hFO0FBRUEsTUFBTSxtQkFBa0M7Q0FDdEMsWUFBWTtDQUFrQixRQUFRO0NBQTJCLGNBQWM7Q0FDL0UsU0FBUztDQUFJLFFBQVE7Q0FBVyxZQUFZO0FBQzlDO0FBRUEsTUFBTSxrQkFBaUM7Q0FDckMsT0FBTztDQUFRLGFBQWE7Q0FBUyxjQUFjO0NBQUcsVUFBVTtDQUNoRSxZQUFZO0NBQStCLFNBQVM7Q0FBUSxZQUFZO0NBQVUsZ0JBQWdCO0NBQ2xHLGNBQWM7QUFDaEIiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiTmV0ZWFzZS50c3giXSwidmVyc2lvbiI6Mywic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdXNlRWZmZWN0LCB1c2VNZW1vLCB1c2VTdGF0ZSwgdHlwZSBDU1NQcm9wZXJ0aWVzIH0gZnJvbSBcInJlYWN0XCJcbmltcG9ydCB7IGFwaSB9IGZyb20gXCIuLi9saWIvYXBpXCJcbmltcG9ydCB0eXBlIHsgTmV0ZWFzZUl0ZW0sIE5ldGVhc2VEZXRhaWwsIE5ldGVhc2VLaW5kIH0gZnJvbSBcIi4uL2xpYi90eXBlc1wiXG5pbXBvcnQgeyBTcGlubmVyLCBFbXB0eSB9IGZyb20gXCIuLi9jb21wb25lbnRzL3VpXCJcbmltcG9ydCB7XG4gIE11c2ljMiwgRXh0ZXJuYWxMaW5rLCBTZWFyY2ggYXMgU2VhcmNoSWNvbiwgQ2xvY2ssIFRyZW5kaW5nVXAsIERpc2MsIE1pYzIsIExpc3RNdXNpYyxcbiAgSGlzdG9yeSwgRmxhbWUsIEFycm93VXBEb3duLCBDYWxlbmRhciwgSGFzaCwgUGxheUNpcmNsZSwgWCwgQ29weSwgQ2hlY2ssIFNwYXJrbGVzLFxuICBBbGVydENpcmNsZSwgQmFyQ2hhcnQzLCBIZWFydCwgTWVzc2FnZUNpcmNsZSwgVXNlciwgRm9sZGVyT3BlbiwgVHJhc2gyLFxufSBmcm9tIFwibHVjaWRlLXJlYWN0XCJcblxuY29uc3QgVFlQRVM6IHsga2V5OiBOZXRlYXNlS2luZDsgbGFiZWw6IHN0cmluZzsgaWNvbjogdHlwZW9mIE11c2ljMiB9W10gPSBbXG4gIHsga2V5OiBcInNvbmdcIiwgbGFiZWw6IFwi5Y2V5puyXCIsIGljb246IE11c2ljMiB9LFxuICB7IGtleTogXCJhcnRpc3RcIiwgbGFiZWw6IFwi5q2M5omLXCIsIGljb246IE1pYzIgfSxcbiAgeyBrZXk6IFwiYWxidW1cIiwgbGFiZWw6IFwi5LiT6L6RXCIsIGljb246IERpc2MgfSxcbiAgeyBrZXk6IFwicGxheWxpc3RcIiwgbGFiZWw6IFwi5q2M5Y2VXCIsIGljb246IExpc3RNdXNpYyB9LFxuXVxuXG5jb25zdCBIT1RfU0VBUkNIRVMgPSBbXG4gIFwi5Yid6Z+z5pyq5p2lXCIsIFwi5Y2D5pys5qixXCIsIFwi6bOz5Yew5LydXCIsIFwi44Oe44OI44Oq44On44K344KrXCIsIFwi44Ot44K544OI44Ov44Oz44Gu5Y+35ZOtXCIsXG4gIFwi44OJ44O844OK44OE44Ob44O844OrXCIsIFwi56We44Gj44G944GE44GqXCIsIFwi44OA44O844Oq44Oz44OA44Oz44K5XCIsIFwi44Ot44KtXCIsIFwi44Ko44K044Ot44OD44KvXCIsXG5dXG5cbmNvbnN0IEhJU1RPUllfS0VZID0gXCJuZXRlYXNlLXNlYXJjaC1oaXN0b3J5XCJcblxuZnVuY3Rpb24gZm10RHVyKG1zPzogbnVtYmVyIHwgbnVsbCkge1xuICBpZiAoIW1zKSByZXR1cm4gXCLigJRcIlxuICBjb25zdCBzID0gTWF0aC5yb3VuZChtcyAvIDEwMDApXG4gIHJldHVybiBgJHtNYXRoLmZsb29yKHMgLyA2MCl9OiR7U3RyaW5nKHMgJSA2MCkucGFkU3RhcnQoMiwgXCIwXCIpfWBcbn1cblxuZnVuY3Rpb24gZm10TnVtKG4/OiBudW1iZXIgfCBudWxsKSB7XG4gIGlmIChuID09IG51bGwpIHJldHVybiBcIuKAlFwiXG4gIGlmIChuID49IDEwXzAwMF8wMDApIHJldHVybiBgJHsobiAvIDEwXzAwMF8wMDApLnRvRml4ZWQoMSl9MDAw5LiHYFxuICBpZiAobiA+PSAxMF8wMDApIHJldHVybiBgJHsobiAvIDEwXzAwMCkudG9GaXhlZCgxKX3kuIdgXG4gIHJldHVybiBuLnRvTG9jYWxlU3RyaW5nKClcbn1cblxuZnVuY3Rpb24gbmV0ZWFzZVVybChraW5kOiBzdHJpbmcsIGlkOiBudW1iZXIgfCBzdHJpbmcpIHtcbiAgY29uc3QgcGF0aDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBzb25nOiBcInNvbmdcIiwgYXJ0aXN0OiBcImFydGlzdFwiLCBhbGJ1bTogXCJhbGJ1bVwiLCBwbGF5bGlzdDogXCJwbGF5bGlzdFwiLFxuICB9XG4gIHJldHVybiBgaHR0cHM6Ly9tdXNpYy4xNjMuY29tLyMvJHtwYXRoW2tpbmRdID8/IFwic2VhcmNoXCJ9P2lkPSR7aWR9YFxufVxuXG5mdW5jdGlvbiBwb3BQZXJjZW50KHBvcD86IG51bWJlciB8IG51bGwpIHtcbiAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgKHBvcCA/PyAwKSkpXG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE5ldGVhc2UoKSB7XG4gIGNvbnN0IFtrdywgc2V0S3ddID0gdXNlU3RhdGUoXCJcIilcbiAgY29uc3QgW3R5cGUsIHNldFR5cGVdID0gdXNlU3RhdGU8TmV0ZWFzZUtpbmQ+KFwic29uZ1wiKVxuICBjb25zdCBbaXRlbXMsIHNldEl0ZW1zXSA9IHVzZVN0YXRlPE5ldGVhc2VJdGVtW10+KFtdKVxuICBjb25zdCBbbG9hZGluZywgc2V0TG9hZGluZ10gPSB1c2VTdGF0ZShmYWxzZSlcbiAgY29uc3QgW2Vycm9yLCBzZXRFcnJvcl0gPSB1c2VTdGF0ZTxzdHJpbmcgfCBudWxsPihudWxsKVxuICBjb25zdCBbc2VhcmNoZWQsIHNldFNlYXJjaGVkXSA9IHVzZVN0YXRlKGZhbHNlKVxuICBjb25zdCBbYWN0aXZlLCBzZXRBY3RpdmVdID0gdXNlU3RhdGU8TmV0ZWFzZUl0ZW0gfCBudWxsPihudWxsKVxuICBjb25zdCBbZGV0YWlsLCBzZXREZXRhaWxdID0gdXNlU3RhdGU8TmV0ZWFzZURldGFpbCB8IG51bGw+KG51bGwpXG4gIGNvbnN0IFtkZXRhaWxMb2FkaW5nLCBzZXREZXRhaWxMb2FkaW5nXSA9IHVzZVN0YXRlKGZhbHNlKVxuICBjb25zdCBbaGlzdG9yeSwgc2V0SGlzdG9yeV0gPSB1c2VTdGF0ZTxzdHJpbmdbXT4oW10pXG4gIGNvbnN0IFtzb3J0LCBzZXRTb3J0XSA9IHVzZVN0YXRlPFwiZGVmYXVsdFwiIHwgXCJwb3BcIiB8IFwibmFtZVwiPihcImRlZmF1bHRcIilcbiAgY29uc3QgW2NvcGllZCwgc2V0Q29waWVkXSA9IHVzZVN0YXRlKGZhbHNlKVxuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKEhJU1RPUllfS0VZKVxuICAgICAgaWYgKHJhdykgc2V0SGlzdG9yeShKU09OLnBhcnNlKHJhdykpXG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gIH0sIFtdKVxuXG4gIGZ1bmN0aW9uIHNhdmVIaXN0b3J5KGtleXdvcmQ6IHN0cmluZykge1xuICAgIGlmICgha2V5d29yZC50cmltKCkpIHJldHVyblxuICAgIHNldEhpc3RvcnkoKHByZXYpID0+IHtcbiAgICAgIGNvbnN0IG5leHQgPSBba2V5d29yZC50cmltKCksIC4uLnByZXYuZmlsdGVyKChoKSA9PiBoICE9PSBrZXl3b3JkLnRyaW0oKSldLnNsaWNlKDAsIDEyKVxuICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oSElTVE9SWV9LRVksIEpTT04uc3RyaW5naWZ5KG5leHQpKSB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgIHJldHVybiBuZXh0XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFySGlzdG9yeSgpIHtcbiAgICBzZXRIaXN0b3J5KFtdKVxuICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKEhJU1RPUllfS0VZKSB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRvU2VhcmNoKCkge1xuICAgIGNvbnN0IGsgPSBrdy50cmltKClcbiAgICBpZiAoIWspIHJldHVyblxuICAgIHNldExvYWRpbmcodHJ1ZSlcbiAgICBzZXRFcnJvcihudWxsKVxuICAgIHNldFNlYXJjaGVkKHRydWUpXG4gICAgc2V0QWN0aXZlKG51bGwpXG4gICAgc2V0RGV0YWlsKG51bGwpXG4gICAgc2F2ZUhpc3RvcnkoaylcbiAgICBhcGkubmV0ZWFzZVNlYXJjaChrLCAzMCwgdHlwZSlcbiAgICAgIC50aGVuKChyKSA9PiBzZXRJdGVtcyhyLml0ZW1zKSlcbiAgICAgIC5jYXRjaCgoZTogYW55KSA9PiB7XG4gICAgICAgIHNldEVycm9yKGU/Lm1lc3NhZ2UgPz8gU3RyaW5nKGUpKVxuICAgICAgICBzZXRJdGVtcyhbXSlcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiBzZXRMb2FkaW5nKGZhbHNlKSlcbiAgfVxuXG4gIGZ1bmN0aW9uIG9wZW5JdGVtKGl0OiBOZXRlYXNlSXRlbSkge1xuICAgIHNldEFjdGl2ZShpdClcbiAgICBpZiAoaXQua2luZCA9PT0gXCJzb25nXCIpIHtcbiAgICAgIHNldERldGFpbExvYWRpbmcodHJ1ZSlcbiAgICAgIHNldERldGFpbChudWxsKVxuICAgICAgYXBpLm5ldGVhc2VTb25nKGl0LmlkKVxuICAgICAgICAudGhlbigoZCkgPT4gc2V0RGV0YWlsKGQpKVxuICAgICAgICAuY2F0Y2goKGU6IGFueSkgPT4gc2V0RXJyb3IoZT8ubWVzc2FnZSA/PyBTdHJpbmcoZSkpKVxuICAgICAgICAuZmluYWxseSgoKSA9PiBzZXREZXRhaWxMb2FkaW5nKGZhbHNlKSlcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0RGV0YWlsKG51bGwpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xvc2VEZXRhaWwoKSB7XG4gICAgc2V0QWN0aXZlKG51bGwpXG4gICAgc2V0RGV0YWlsKG51bGwpXG4gIH1cblxuICBjb25zdCBzb3J0ZWRJdGVtcyA9IHVzZU1lbW8oKCkgPT4ge1xuICAgIGlmIChzb3J0ID09PSBcImRlZmF1bHRcIikgcmV0dXJuIGl0ZW1zXG4gICAgY29uc3QgYXJyID0gWy4uLml0ZW1zXVxuICAgIGlmIChzb3J0ID09PSBcInBvcFwiKSB7XG4gICAgICByZXR1cm4gYXJyLnNvcnQoKGEsIGIpID0+IChiLnBvcCA/PyAwKSAtIChhLnBvcCA/PyAwKSlcbiAgICB9XG4gICAgcmV0dXJuIGFyci5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUsIFwiemgtSGFucy1DTlwiKSlcbiAgfSwgW2l0ZW1zLCBzb3J0XSlcblxuICBjb25zdCB0eXBlTGFiZWwgPSBUWVBFUy5maW5kKCh0KSA9PiB0LmtleSA9PT0gdHlwZSk/LmxhYmVsID8/IFwiXCJcbiAgY29uc3QgdHlwZUljb24gPSBUWVBFUy5maW5kKCh0KSA9PiB0LmtleSA9PT0gdHlwZSk/Lmljb24gPz8gTXVzaWMyXG5cbiAgcmV0dXJuIChcbiAgICA8PlxuICAgICAgey8qIOmhtumDqCAqL31cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwidG9wYmFyXCI+XG4gICAgICAgIDxkaXY+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJjcnVtYlwiPue9keaYk+S6kemfs+S5kCDCtyDmkJzntKI8L2Rpdj5cbiAgICAgICAgICA8aDEgc3R5bGU9e3sgZGlzcGxheTogXCJmbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogMTAgfX0+XG4gICAgICAgICAgICA8TXVzaWMyIHNpemU9ezI2fSBzdHlsZT17eyBjb2xvcjogXCJ2YXIoLS1hY2NlbnQpXCIgfX0gLz5cbiAgICAgICAgICAgIOe9keaYk+S6keaQnOe0olxuICAgICAgICAgIDwvaDE+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6IFwiZmxleFwiLCBnYXA6IDgsIGZsZXhXcmFwOiBcIndyYXBcIiB9fT5cbiAgICAgICAgICA8c3BhbiBzdHlsZT17YmFkZ2VTdHlsZX0+PFNwYXJrbGVzIHNpemU9ezEyfSAvPiDlhazlvIDmjqXlj6M8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gc3R5bGU9e2JhZGdlU3R5bGV9PjxGbGFtZSBzaXplPXsxMn0gLz4g5peg6ZyA55m75b2VPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICB7Lyog5pCc57Si5Yy6ICovfVxuICAgICAgPGRpdiBzdHlsZT17c2VhcmNoQm94U3R5bGV9PlxuICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6IFwiZmxleFwiLCBnYXA6IDEwLCBmbGV4V3JhcDogXCJ3cmFwXCIgfX0+XG4gICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICB2YWx1ZT17a3d9XG4gICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldEt3KGUudGFyZ2V0LnZhbHVlKX1cbiAgICAgICAgICAgIG9uS2V5RG93bj17KGUpID0+IHsgaWYgKGUua2V5ID09PSBcIkVudGVyXCIpIGRvU2VhcmNoKCkgfX1cbiAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwi6L6T5YWl5q2M5ZCNIC8g5q2M5omLIC8g5LiT6L6RIC8g5q2M5Y2V4oCmXCJcbiAgICAgICAgICAgIHN0eWxlPXtpbnB1dFN0eWxlfVxuICAgICAgICAgIC8+XG4gICAgICAgICAgPHNlbGVjdCB2YWx1ZT17dHlwZX0gb25DaGFuZ2U9eyhlKSA9PiBzZXRUeXBlKGUudGFyZ2V0LnZhbHVlIGFzIE5ldGVhc2VLaW5kKX0gc3R5bGU9e3NlbGVjdFN0eWxlfT5cbiAgICAgICAgICAgIHtUWVBFUy5tYXAoKHQpID0+IChcbiAgICAgICAgICAgICAgPG9wdGlvbiBrZXk9e3Qua2V5fSB2YWx1ZT17dC5rZXl9Pnt0LmxhYmVsfTwvb3B0aW9uPlxuICAgICAgICAgICAgKSl9XG4gICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtkb1NlYXJjaH0gc3R5bGU9e2J0blN0eWxlfSBkaXNhYmxlZD17bG9hZGluZ30+XG4gICAgICAgICAgICB7bG9hZGluZyA/IDxTcGlubmVyIHNpemU9ezE0fSAvPiA6IDxTZWFyY2hJY29uIHNpemU9ezE0fSAvPn1cbiAgICAgICAgICAgIDxzcGFuPuaQnOe0ojwvc3Bhbj5cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIOeDremXqCArIOWOhuWPsiAqL31cbiAgICAgICAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6IDE0LCBkaXNwbGF5OiBcImZsZXhcIiwgZmxleERpcmVjdGlvbjogXCJjb2x1bW5cIiwgZ2FwOiAxMCB9fT5cbiAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6IFwiZmxleFwiLCBhbGlnbkl0ZW1zOiBcImNlbnRlclwiLCBnYXA6IDgsIGZsZXhXcmFwOiBcIndyYXBcIiB9fT5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGZvbnRTaXplOiAxMiwgY29sb3I6IFwidmFyKC0tdGV4dC1kaW0pXCIsIGRpc3BsYXk6IFwiaW5saW5lLWZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgZ2FwOiA0IH19PlxuICAgICAgICAgICAgICA8RmxhbWUgc2l6ZT17MTJ9IC8+IOeDremXqOaQnOe0olxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAge0hPVF9TRUFSQ0hFUy5tYXAoKGgpID0+IChcbiAgICAgICAgICAgICAgPGJ1dHRvbiBrZXk9e2h9IHN0eWxlPXtjaGlwU3R5bGV9IG9uQ2xpY2s9eygpID0+IHsgc2V0S3coaCk7IGRvU2VhcmNoKCkgfX0+e2h9PC9idXR0b24+XG4gICAgICAgICAgICApKX1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICB7aGlzdG9yeS5sZW5ndGggPiAwICYmIChcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJmbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogOCwgZmxleFdyYXA6IFwid3JhcFwiIH19PlxuICAgICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBmb250U2l6ZTogMTIsIGNvbG9yOiBcInZhcigtLXRleHQtZGltKVwiLCBkaXNwbGF5OiBcImlubGluZS1mbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogNCB9fT5cbiAgICAgICAgICAgICAgICA8SGlzdG9yeSBzaXplPXsxMn0gLz4g5pCc57Si5Y6G5Y+yXG4gICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAge2hpc3RvcnkubWFwKChoKSA9PiAoXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBrZXk9e2h9IHN0eWxlPXtjaGlwU3R5bGV9IG9uQ2xpY2s9eygpID0+IHsgc2V0S3coaCk7IGRvU2VhcmNoKCkgfX0+e2h9PC9idXR0b24+XG4gICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICA8YnV0dG9uIHN0eWxlPXt7IC4uLmNoaXBTdHlsZSwgY29sb3I6IFwidmFyKC0tZGFuZ2VyKVwiIH19IG9uQ2xpY2s9e2NsZWFySGlzdG9yeX0gdGl0bGU9XCLmuIXnqbrljoblj7JcIj5cbiAgICAgICAgICAgICAgICA8VHJhc2gyIHNpemU9ezEyfSAvPlxuICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICl9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIHsvKiDor7TmmI4gKi99XG4gICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAxMi41LCBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgbWFyZ2luOiBcIjE0cHggMCAxOHB4XCIsIGxpbmVIZWlnaHQ6IDEuNiB9fT5cbiAgICAgICAgPEFsZXJ0Q2lyY2xlIHNpemU9ezEzfSBzdHlsZT17eyB2ZXJ0aWNhbEFsaWduOiBcIi0ycHhcIiwgbWFyZ2luUmlnaHQ6IDUgfX0gLz5cbiAgICAgICAg5pWw5o2u5p2l6Ieq572R5piT5LqR5YWs5byA5o6l5Y+j44CCPGI+5pKt5pS+6YePPC9iPuaOpeWPo+W3suWFs+mXre+8jOWNleabsuivpuaDheS7pTxiPueDreW6piAvIOivhOiuuuaVsDwvYj7kuLrlh4bvvJvmkJzntKLnu5PmnpzkuK3ngrnlh7vljZXmm7Llj6/liqDovb3or6bmg4XlsIHpnaLjgIJcbiAgICAgIDwvZGl2PlxuXG4gICAgICB7ZXJyb3IgJiYgKFxuICAgICAgICA8ZGl2IHN0eWxlPXt7IC4uLmJhbm5lclN0eWxlLCBiYWNrZ3JvdW5kOiBcImNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1kYW5nZXIpIDEyJSwgdHJhbnNwYXJlbnQpXCIsIGNvbG9yOiBcInZhcigtLWRhbmdlcilcIiwgbWFyZ2luQm90dG9tOiAxNiB9fT5cbiAgICAgICAgICA8QWxlcnRDaXJjbGUgc2l6ZT17MTZ9IC8+IHtlcnJvcn1cbiAgICAgICAgPC9kaXY+XG4gICAgICApfVxuXG4gICAgICB7bG9hZGluZyAmJiAoXG4gICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJncmlkXCIsIGdyaWRUZW1wbGF0ZUNvbHVtbnM6IFwicmVwZWF0KGF1dG8tZmlsbCwgbWlubWF4KDIyMHB4LCAxZnIpKVwiLCBnYXA6IDE0IH19PlxuICAgICAgICAgIHtBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0pLm1hcCgoXywgaSkgPT4gPFNrZWxldG9uQ2FyZCBrZXk9e2l9IC8+KX1cbiAgICAgICAgPC9kaXY+XG4gICAgICApfVxuXG4gICAgICB7IWxvYWRpbmcgJiYgc2VhcmNoZWQgJiYgaXRlbXMubGVuZ3RoID09PSAwICYmIChcbiAgICAgICAgPEVtcHR5IGxhYmVsPXtg5pyq5om+5Yiw44CMJHtrd33jgI3nm7jlhbMke3R5cGVMYWJlbH3vvIzor5Xor5XliIfmjaLnsbvlnovmiJbmjaLkuKrlhbPplK7or41gfSAvPlxuICAgICAgKX1cblxuICAgICAgeyFsb2FkaW5nICYmIGl0ZW1zLmxlbmd0aCA+IDAgJiYgKFxuICAgICAgICA8PlxuICAgICAgICAgIDxkaXYgc3R5bGU9e3Rvb2xiYXJTdHlsZX0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAxMywgY29sb3I6IFwidmFyKC0tdGV4dC1kaW0pXCIsIGRpc3BsYXk6IFwiZmxleFwiLCBhbGlnbkl0ZW1zOiBcImNlbnRlclwiLCBnYXA6IDggfX0+XG4gICAgICAgICAgICAgIDxIYXNoIHNpemU9ezEzfSAvPlxuICAgICAgICAgICAgICDlhbEgPGIgc3R5bGU9e3sgY29sb3I6IFwidmFyKC0tdGV4dClcIiB9fT57aXRlbXMubGVuZ3RofTwvYj4g5Liqe3R5cGVMYWJlbH3nu5PmnpxcbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiBcImZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgZ2FwOiA4IH19PlxuICAgICAgICAgICAgICA8QXJyb3dVcERvd24gc2l6ZT17MTN9IHN0eWxlPXt7IGNvbG9yOiBcInZhcigtLXRleHQtZGltKVwiIH19IC8+XG4gICAgICAgICAgICAgIDxzZWxlY3QgdmFsdWU9e3NvcnR9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0U29ydChlLnRhcmdldC52YWx1ZSBhcyBhbnkpfSBzdHlsZT17c29ydFNlbGVjdFN0eWxlfT5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZGVmYXVsdFwiPum7mOiupOaOkuW6jzwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwb3BcIj7ng63luqbkvJjlhYg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibmFtZVwiPuWQjeensOaOkuW6jzwvb3B0aW9uPlxuICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgPGRpdiBzdHlsZT17Z3JpZFN0eWxlfT5cbiAgICAgICAgICAgIHtzb3J0ZWRJdGVtcy5tYXAoKGl0KSA9PiAoXG4gICAgICAgICAgICAgIDxSZXN1bHRDYXJkXG4gICAgICAgICAgICAgICAga2V5PXtgJHtpdC5raW5kfS0ke2l0LmlkfWB9XG4gICAgICAgICAgICAgICAgaXQ9e2l0fVxuICAgICAgICAgICAgICAgIGFjdGl2ZT17YWN0aXZlPy5pZCA9PT0gaXQuaWQgJiYgYWN0aXZlPy5raW5kID09PSBpdC5raW5kfVxuICAgICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IG9wZW5JdGVtKGl0KX1cbiAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICkpfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8Lz5cbiAgICAgICl9XG5cbiAgICAgIHshbG9hZGluZyAmJiAhc2VhcmNoZWQgJiYgKFxuICAgICAgICA8ZGl2IHN0eWxlPXtwbGFjZWhvbGRlclN0eWxlfT5cbiAgICAgICAgICA8TXVzaWMyIHNpemU9ezU2fSBzdHlsZT17eyBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLCBvcGFjaXR5OiAwLjYgfX0gLz5cbiAgICAgICAgICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogMTQsIGZvbnRTaXplOiAxNSwgY29sb3I6IFwidmFyKC0tdGV4dC1kaW0pXCIgfX0+XG4gICAgICAgICAgICDovpPlhaXlhbPplK7or43vvIzlvIDlp4vmjqLntKLnvZHmmJPkupHpn7PkuZBcbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogNiwgZm9udFNpemU6IDEyLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiIH19PlxuICAgICAgICAgICAg5pSv5oyB5Y2V5puy44CB5q2M5omL44CB5LiT6L6R44CB5q2M5Y2V5Zub57G75pCc57SiXG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKX1cblxuICAgICAgey8qIOivpuaDhemdouadvyAqL31cbiAgICAgIHthY3RpdmUgJiYgKFxuICAgICAgICA8RGV0YWlsUGFuZWxcbiAgICAgICAgICBhY3RpdmU9e2FjdGl2ZX1cbiAgICAgICAgICBkZXRhaWw9e2RldGFpbH1cbiAgICAgICAgICBkZXRhaWxMb2FkaW5nPXtkZXRhaWxMb2FkaW5nfVxuICAgICAgICAgIHR5cGVMYWJlbD17dHlwZUxhYmVsfVxuICAgICAgICAgIHJlbGF0ZWQ9e3NvcnRlZEl0ZW1zLmZpbHRlcigoeCkgPT4geC5pZCAhPT0gYWN0aXZlLmlkKS5zbGljZSgwLCA2KX1cbiAgICAgICAgICBvbkNsb3NlPXtjbG9zZURldGFpbH1cbiAgICAgICAgICBvbk9wZW5JdGVtPXtvcGVuSXRlbX1cbiAgICAgICAgICBjb3BpZWQ9e2NvcGllZH1cbiAgICAgICAgICBvbkNvcHk9eygpID0+IHtcbiAgICAgICAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KG5ldGVhc2VVcmwoYWN0aXZlLmtpbmQsIGFjdGl2ZS5pZCkpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBzZXRDb3BpZWQodHJ1ZSlcbiAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiBzZXRDb3BpZWQoZmFsc2UpLCAxNTAwKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9fVxuICAgICAgICAvPlxuICAgICAgKX1cbiAgICA8Lz5cbiAgKVxufVxuXG5mdW5jdGlvbiBSZXN1bHRDYXJkKHsgaXQsIGFjdGl2ZSwgb25DbGljayB9OiB7IGl0OiBOZXRlYXNlSXRlbTsgYWN0aXZlOiBib29sZWFuOyBvbkNsaWNrOiAoKSA9PiB2b2lkIH0pIHtcbiAgY29uc3QgSWNvbiA9IGl0LmtpbmQgPT09IFwiYXJ0aXN0XCIgPyBNaWMyIDogaXQua2luZCA9PT0gXCJhbGJ1bVwiID8gRGlzYyA6IGl0LmtpbmQgPT09IFwicGxheWxpc3RcIiA/IExpc3RNdXNpYyA6IE11c2ljMlxuICByZXR1cm4gKFxuICAgIDxkaXYgc3R5bGU9e2NhcmRTdHlsZShhY3RpdmUpfSBvbkNsaWNrPXtvbkNsaWNrfT5cbiAgICAgIDxkaXYgc3R5bGU9e3BpY1dyYXBTdHlsZX0+XG4gICAgICAgIHtpdC5waWNcbiAgICAgICAgICA/IDxpbWcgc3JjPXtpdC5waWN9IGFsdD17aXQubmFtZX0gc3R5bGU9e3BpY1N0eWxlfSBsb2FkaW5nPVwibGF6eVwiIC8+XG4gICAgICAgICAgOiA8ZGl2IHN0eWxlPXtwaWNQbGFjZWhvbGRlclN0eWxlfT48SWNvbiBzaXplPXszNH0gLz48L2Rpdj59XG4gICAgICAgIHtpdC5raW5kID09PSBcInNvbmdcIiAmJiBpdC5kdXJhdGlvbl9tcyA/IChcbiAgICAgICAgICA8c3BhbiBzdHlsZT17ZHVyYXRpb25CYWRnZVN0eWxlfT48Q2xvY2sgc2l6ZT17MTB9IC8+IHtmbXREdXIoaXQuZHVyYXRpb25fbXMpfTwvc3Bhbj5cbiAgICAgICAgKSA6IG51bGx9XG4gICAgICAgIHtpdC5raW5kID09PSBcInNvbmdcIiAmJiBpdC5tdl9pZCA/IChcbiAgICAgICAgICA8c3BhbiBzdHlsZT17bXZCYWRnZVN0eWxlfT48UGxheUNpcmNsZSBzaXplPXsxMH0gLz4gTVY8L3NwYW4+XG4gICAgICAgICkgOiBudWxsfVxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAxMCwgbWluSGVpZ2h0OiAwIH19PlxuICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRXZWlnaHQ6IDcwMCwgZm9udFNpemU6IDE0LjUsIGxpbmVIZWlnaHQ6IDEuMzUsIG92ZXJmbG93OiBcImhpZGRlblwiLCB0ZXh0T3ZlcmZsb3c6IFwiZWxsaXBzaXNcIiwgd2hpdGVTcGFjZTogXCJub3dyYXBcIiB9fT5cbiAgICAgICAgICB7aXQubmFtZX1cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAge2l0LmtpbmQgPT09IFwic29uZ1wiICYmIGl0LmFsaWFzICYmIGl0LmFsaWFzLmxlbmd0aCA+IDAgJiYgKFxuICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJmbGV4XCIsIGdhcDogNCwgbWFyZ2luVG9wOiA1LCBmbGV4V3JhcDogXCJ3cmFwXCIgfX0+XG4gICAgICAgICAgICB7aXQuYWxpYXMuc2xpY2UoMCwgMikubWFwKChhLCBpKSA9PiAoXG4gICAgICAgICAgICAgIDxzcGFuIGtleT17aX0gc3R5bGU9e3RhZ1N0eWxlfT57YX08L3NwYW4+XG4gICAgICAgICAgICApKX1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKX1cblxuICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAxMi41LCBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgbWFyZ2luVG9wOiA1LCBvdmVyZmxvdzogXCJoaWRkZW5cIiwgdGV4dE92ZXJmbG93OiBcImVsbGlwc2lzXCIsIHdoaXRlU3BhY2U6IFwibm93cmFwXCIgfX0+XG4gICAgICAgICAge2l0LmtpbmQgPT09IFwic29uZ1wiICYmIGl0LmFsYnVtID8gYCR7aXQuc3VifSDCtyDjgIoke2l0LmFsYnVtfeOAi2AgOiBpdC5zdWJ9XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiA4LCBkaXNwbGF5OiBcImZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgZ2FwOiA4LCBmbGV4V3JhcDogXCJ3cmFwXCIgfX0+XG4gICAgICAgICAge2l0LmtpbmQgPT09IFwic29uZ1wiICYmIGl0LnBvcCAhPSBudWxsICYmIChcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSwgbWluV2lkdGg6IDYwIH19PlxuICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGhlaWdodDogNCwgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1zb2Z0KVwiLCBib3JkZXJSYWRpdXM6IDIsIG92ZXJmbG93OiBcImhpZGRlblwiIH19PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgd2lkdGg6IGAke3BvcFBlcmNlbnQoaXQucG9wKX0lYCwgaGVpZ2h0OiBcIjEwMCVcIiwgYmFja2dyb3VuZDogXCJ2YXIoLS1hY2NlbnQpXCIsIGJvcmRlclJhZGl1czogMiB9fSAvPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBmb250U2l6ZTogMTAuNSwgY29sb3I6IFwidmFyKC0tdGV4dC1mYWludClcIiwgbWFyZ2luVG9wOiAyIH19PueDreW6piB7aXQucG9wfTwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgKX1cbiAgICAgICAgICB7aXQua2luZCA9PT0gXCJhcnRpc3RcIiAmJiBpdC5tdXNpY19zaXplICE9IG51bGwgJiYgKFxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9e21ldGFTdHlsZX0+PE11c2ljMiBzaXplPXsxMX0gLz4ge2l0Lm11c2ljX3NpemV9IOmmljwvc3Bhbj5cbiAgICAgICAgICApfVxuICAgICAgICAgIHtpdC5raW5kID09PSBcImFsYnVtXCIgJiYgaXQuc2l6ZSAhPSBudWxsICYmIChcbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXttZXRhU3R5bGV9PjxEaXNjIHNpemU9ezExfSAvPiB7aXQuc2l6ZX0g6aaWPC9zcGFuPlxuICAgICAgICAgICl9XG4gICAgICAgICAge2l0LmtpbmQgPT09IFwicGxheWxpc3RcIiAmJiBpdC50cmFja19jb3VudCAhPSBudWxsICYmIChcbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXttZXRhU3R5bGV9PjxMaXN0TXVzaWMgc2l6ZT17MTF9IC8+IHtpdC50cmFja19jb3VudH0g6aaWPC9zcGFuPlxuICAgICAgICAgICl9XG4gICAgICAgICAge2l0LmtpbmQgPT09IFwicGxheWxpc3RcIiAmJiBpdC5wbGF5X2NvdW50ICE9IG51bGwgJiYgKFxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9e21ldGFTdHlsZX0+PFRyZW5kaW5nVXAgc2l6ZT17MTF9IC8+IHtmbXROdW0oaXQucGxheV9jb3VudCl9PC9zcGFuPlxuICAgICAgICAgICl9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIClcbn1cblxuZnVuY3Rpb24gRGV0YWlsUGFuZWwoe1xuICBhY3RpdmUsIGRldGFpbCwgZGV0YWlsTG9hZGluZywgdHlwZUxhYmVsLCByZWxhdGVkLCBvbkNsb3NlLCBvbk9wZW5JdGVtLCBjb3BpZWQsIG9uQ29weSxcbn06IHtcbiAgYWN0aXZlOiBOZXRlYXNlSXRlbVxuICBkZXRhaWw6IE5ldGVhc2VEZXRhaWwgfCBudWxsXG4gIGRldGFpbExvYWRpbmc6IGJvb2xlYW5cbiAgdHlwZUxhYmVsOiBzdHJpbmdcbiAgcmVsYXRlZDogTmV0ZWFzZUl0ZW1bXVxuICBvbkNsb3NlOiAoKSA9PiB2b2lkXG4gIG9uT3Blbkl0ZW06IChpdDogTmV0ZWFzZUl0ZW0pID0+IHZvaWRcbiAgY29waWVkOiBib29sZWFuXG4gIG9uQ29weTogKCkgPT4gdm9pZFxufSkge1xuICBjb25zdCBpc1NvbmcgPSBhY3RpdmUua2luZCA9PT0gXCJzb25nXCJcbiAgY29uc3QgY292ZXIgPSBkZXRhaWw/LmFsYnVtX3BpYyB8fCBhY3RpdmUucGljXG4gIGNvbnN0IHN0YXRDYXJkcyA9IFtcbiAgICB7IGljb246IEZsYW1lLCBsYWJlbDogXCLng63luqZcIiwgdmFsdWU6IGRldGFpbD8ucG9wID8/IGFjdGl2ZS5wb3AgPz8gXCLigJRcIiB9LFxuICAgIHsgaWNvbjogTWVzc2FnZUNpcmNsZSwgbGFiZWw6IFwi6K+E6K665pWwXCIsIHZhbHVlOiBmbXROdW0oZGV0YWlsPy5jb21tZW50X2NvdW50KSB9LFxuICAgIHsgaWNvbjogSGVhcnQsIGxhYmVsOiBcIuaSreaUvumHj1wiLCB2YWx1ZTogXCLnvZHmmJPkupHmnKrlhazlvIBcIiB9LFxuICAgIHsgaWNvbjogQ2xvY2ssIGxhYmVsOiBcIuaXtumVv1wiLCB2YWx1ZTogZm10RHVyKGRldGFpbD8uZHVyYXRpb25fbXMgPz8gYWN0aXZlLmR1cmF0aW9uX21zKSB9LFxuICBdXG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IHN0eWxlPXttb2RhbE92ZXJsYXlTdHlsZX0gb25DbGljaz17KGUpID0+IHsgaWYgKGUudGFyZ2V0ID09PSBlLmN1cnJlbnRUYXJnZXQpIG9uQ2xvc2UoKSB9fT5cbiAgICAgIDxkaXYgc3R5bGU9e21vZGFsUGFuZWxTdHlsZX0+XG4gICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJmbGV4XCIsIGp1c3RpZnlDb250ZW50OiBcInNwYWNlLWJldHdlZW5cIiwgYWxpZ25JdGVtczogXCJmbGV4LXN0YXJ0XCIsIGdhcDogMTIsIG1hcmdpbkJvdHRvbTogMTYgfX0+XG4gICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZm9udFNpemU6IDEyLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLCBtYXJnaW5Cb3R0b206IDQgfX0+572R5piT5LqRIMK3IHt0eXBlTGFiZWx9PC9kaXY+XG4gICAgICAgICAgICA8aDIgc3R5bGU9e3sgbWFyZ2luOiAwLCBmb250U2l6ZTogMjAsIGxpbmVIZWlnaHQ6IDEuMyB9fT57YWN0aXZlLm5hbWV9PC9oMj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uQ2xvc2V9IHN0eWxlPXtpY29uQnRuU3R5bGV9IHRpdGxlPVwi5YWz6ZetXCI+PFggc2l6ZT17MTh9IC8+PC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJmbGV4XCIsIGdhcDogMjAsIGZsZXhXcmFwOiBcIndyYXBcIiB9fT5cbiAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZsZXhTaHJpbms6IDAgfX0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IC4uLmNvdmVyV3JhcFN0eWxlLCBiYWNrZ3JvdW5kSW1hZ2U6IGNvdmVyID8gYHVybCgke2NvdmVyfSlgIDogdW5kZWZpbmVkIH19PlxuICAgICAgICAgICAgICB7IWNvdmVyICYmIDxNdXNpYzIgc2l6ZT17NTJ9IHN0eWxlPXt7IGNvbG9yOiBcInZhcigtLXRleHQtZmFpbnQpXCIgfX0gLz59XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSwgbWluV2lkdGg6IDI0MCB9fT5cbiAgICAgICAgICAgIHtkZXRhaWw/LmFsaWFzICYmIGRldGFpbC5hbGlhcy5sZW5ndGggPiAwICYmIChcbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiBcImZsZXhcIiwgZ2FwOiA2LCBmbGV4V3JhcDogXCJ3cmFwXCIsIG1hcmdpbkJvdHRvbTogMTAgfX0+XG4gICAgICAgICAgICAgICAge2RldGFpbC5hbGlhcy5tYXAoKGEsIGkpID0+IDxzcGFuIGtleT17aX0gc3R5bGU9e3RhZ1N0eWxlfT57YX08L3NwYW4+KX1cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICApfVxuXG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAxNCwgY29sb3I6IFwidmFyKC0tdGV4dC1kaW0pXCIsIG1hcmdpbkJvdHRvbTogMTIgfX0+XG4gICAgICAgICAgICAgIHtpc1NvbmcgPyAoXG4gICAgICAgICAgICAgICAgPD5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGRpc3BsYXk6IFwiaW5saW5lLWZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgZ2FwOiA0IH19PjxNaWMyIHNpemU9ezEzfSAvPiB7ZGV0YWlsPy5hcnRpc3RzPy5qb2luKFwiIC8gXCIpIHx8IGFjdGl2ZS5zdWJ9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAge2RldGFpbD8uYWxidW0gJiYgPHNwYW4gc3R5bGU9e3sgbWFyZ2luTGVmdDogMTAgfX0+PERpc2Mgc2l6ZT17MTN9IHN0eWxlPXt7IHZlcnRpY2FsQWxpZ246IFwiLTJweFwiIH19IC8+IOOAintkZXRhaWwuYWxidW1944CLPC9zcGFuPn1cbiAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgKSA6IChcbiAgICAgICAgICAgICAgICA8c3Bhbj57YWN0aXZlLnN1Yn08L3NwYW4+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAge2lzU29uZyAmJiBkZXRhaWw/LnBvcCAhPSBudWxsICYmIChcbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBtYXJnaW5Cb3R0b206IDE0IH19PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJmbGV4XCIsIGp1c3RpZnlDb250ZW50OiBcInNwYWNlLWJldHdlZW5cIiwgZm9udFNpemU6IDEyLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgbWFyZ2luQm90dG9tOiA0IH19PlxuICAgICAgICAgICAgICAgICAgPHNwYW4+54Ot5bqm5oyH5pWwPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPHNwYW4+e2RldGFpbC5wb3B9IC8gMTAwPC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgaGVpZ2h0OiA4LCBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLXNvZnQpXCIsIGJvcmRlclJhZGl1czogNCwgb3ZlcmZsb3c6IFwiaGlkZGVuXCIgfX0+XG4gICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IHdpZHRoOiBgJHtwb3BQZXJjZW50KGRldGFpbC5wb3ApfSVgLCBoZWlnaHQ6IFwiMTAwJVwiLCBiYWNrZ3JvdW5kOiBcImxpbmVhci1ncmFkaWVudCg5MGRlZywgdmFyKC0tYWNjZW50KSwgI2ZmN2ViMylcIiwgYm9yZGVyUmFkaXVzOiA0IH19IC8+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKX1cblxuICAgICAgICAgICAge2RldGFpbExvYWRpbmcgJiYgPFNwaW5uZXIgLz59XG5cbiAgICAgICAgICAgIHtpc1NvbmcgJiYgZGV0YWlsICYmIChcbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17c3RhdHNHcmlkU3R5bGV9PlxuICAgICAgICAgICAgICAgIHtzdGF0Q2FyZHMubWFwKChzLCBpKSA9PiAoXG4gICAgICAgICAgICAgICAgICA8ZGl2IGtleT17aX0gc3R5bGU9e3N0YXRDYXJkU3R5bGV9PlxuICAgICAgICAgICAgICAgICAgICA8cy5pY29uIHNpemU9ezE2fSBzdHlsZT17eyBjb2xvcjogXCJ2YXIoLS1hY2NlbnQpXCIgfX0gLz5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBmb250U2l6ZTogMTUsIGZvbnRXZWlnaHQ6IDcwMCwgbWFyZ2luVG9wOiA0IH19PntzLnZhbHVlfTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAxMSwgY29sb3I6IFwidmFyKC0tdGV4dC1mYWludClcIiB9fT57cy5sYWJlbH08L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgIHshaXNTb25nICYmIChcbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBwYWRkaW5nOiAxNCwgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1zb2Z0KVwiLCBib3JkZXJSYWRpdXM6IDEyLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgZm9udFNpemU6IDEzIH19PlxuICAgICAgICAgICAgICAgIOeCueWHu+OAjOWcqOe9keaYk+S6keaJk+W8gOOAjeafpeeci+WujOaVtHt0eXBlTGFiZWx96aG16Z2i44CCXG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKX1cblxuICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiBcImZsZXhcIiwgZ2FwOiAxMCwgbWFyZ2luVG9wOiAxNiwgZmxleFdyYXA6IFwid3JhcFwiIH19PlxuICAgICAgICAgICAgICA8YVxuICAgICAgICAgICAgICAgIGhyZWY9e25ldGVhc2VVcmwoYWN0aXZlLmtpbmQsIGFjdGl2ZS5pZCl9XG4gICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCJcbiAgICAgICAgICAgICAgICByZWw9XCJub3JlZmVycmVyXCJcbiAgICAgICAgICAgICAgICBzdHlsZT17eyAuLi5wcmltYXJ5QnRuU3R5bGUsIGRpc3BsYXk6IFwiaW5saW5lLWZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgZ2FwOiA2IH19XG4gICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8RXh0ZXJuYWxMaW5rIHNpemU9ezE0fSAvPiDlnKjnvZHmmJPkupHmiZPlvIBcbiAgICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uQ29weX0gc3R5bGU9e3sgLi4uc2Vjb25kYXJ5QnRuU3R5bGUsIGRpc3BsYXk6IFwiaW5saW5lLWZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgZ2FwOiA2IH19PlxuICAgICAgICAgICAgICAgIHtjb3BpZWQgPyA8Q2hlY2sgc2l6ZT17MTR9IC8+IDogPENvcHkgc2l6ZT17MTR9IC8+fVxuICAgICAgICAgICAgICAgIHtjb3BpZWQgPyBcIuW3suWkjeWItlwiIDogXCLlpI3liLbpk77mjqVcIn1cbiAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAge3JlbGF0ZWQubGVuZ3RoID4gMCAmJiAoXG4gICAgICAgICAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6IDI0IH19PlxuICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBmb250U2l6ZTogMTQsIGZvbnRXZWlnaHQ6IDcwMCwgbWFyZ2luQm90dG9tOiAxMiwgZGlzcGxheTogXCJmbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogNiB9fT5cbiAgICAgICAgICAgICAgPFNwYXJrbGVzIHNpemU9ezE0fSBzdHlsZT17eyBjb2xvcjogXCJ2YXIoLS1hY2NlbnQpXCIgfX0gLz4g55u45YWz5o6o6I2QXG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogXCJncmlkXCIsIGdyaWRUZW1wbGF0ZUNvbHVtbnM6IFwicmVwZWF0KGF1dG8tZmlsbCwgbWlubWF4KDE2MHB4LCAxZnIpKVwiLCBnYXA6IDEwIH19PlxuICAgICAgICAgICAgICB7cmVsYXRlZC5tYXAoKGl0KSA9PiAoXG4gICAgICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgICAga2V5PXtgcmVsLSR7aXQua2luZH0tJHtpdC5pZH1gfVxuICAgICAgICAgICAgICAgICAgc3R5bGU9e3JlbGF0ZWRDYXJkU3R5bGV9XG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBvbk9wZW5JdGVtKGl0KX1cbiAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IC4uLnJlbGF0ZWRQaWNTdHlsZSwgYmFja2dyb3VuZEltYWdlOiBpdC5waWMgPyBgdXJsKCR7aXQucGljfSlgIDogdW5kZWZpbmVkIH19PlxuICAgICAgICAgICAgICAgICAgICB7IWl0LnBpYyAmJiA8TXVzaWMyIHNpemU9ezE4fSBzdHlsZT17eyBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiIH19IC8+fVxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAxMi41LCBmb250V2VpZ2h0OiA2MDAsIG92ZXJmbG93OiBcImhpZGRlblwiLCB0ZXh0T3ZlcmZsb3c6IFwiZWxsaXBzaXNcIiwgd2hpdGVTcGFjZTogXCJub3dyYXBcIiB9fT57aXQubmFtZX08L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZm9udFNpemU6IDExLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLCBvdmVyZmxvdzogXCJoaWRkZW5cIiwgdGV4dE92ZXJmbG93OiBcImVsbGlwc2lzXCIsIHdoaXRlU3BhY2U6IFwibm93cmFwXCIgfX0+e2l0LnN1Yn08L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKX1cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICApXG59XG5cbmZ1bmN0aW9uIFNrZWxldG9uQ2FyZCgpIHtcbiAgcmV0dXJuIChcbiAgICA8ZGl2IHN0eWxlPXt7IGJhY2tncm91bmQ6IFwidmFyKC0tYmctY2FyZClcIiwgYm9yZGVyOiBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpXCIsIGJvcmRlclJhZGl1czogMTQsIHBhZGRpbmc6IDE0IH19PlxuICAgICAgPGRpdiBzdHlsZT17eyB3aWR0aDogXCIxMDAlXCIsIGFzcGVjdFJhdGlvOiBcIjEgLyAxXCIsIGJvcmRlclJhZGl1czogMTAsIGJhY2tncm91bmQ6IFwidmFyKC0tYmctc29mdClcIiB9fSAvPlxuICAgICAgPGRpdiBzdHlsZT17eyBoZWlnaHQ6IDE2LCBib3JkZXJSYWRpdXM6IDQsIGJhY2tncm91bmQ6IFwidmFyKC0tYmctc29mdClcIiwgbWFyZ2luVG9wOiAxMiwgd2lkdGg6IFwiNzAlXCIgfX0gLz5cbiAgICAgIDxkaXYgc3R5bGU9e3sgaGVpZ2h0OiAxMiwgYm9yZGVyUmFkaXVzOiA0LCBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLXNvZnQpXCIsIG1hcmdpblRvcDogOCwgd2lkdGg6IFwiNDUlXCIgfX0gLz5cbiAgICAgIDxkaXYgc3R5bGU9e3sgaGVpZ2h0OiA0LCBib3JkZXJSYWRpdXM6IDIsIGJhY2tncm91bmQ6IFwidmFyKC0tYmctc29mdClcIiwgbWFyZ2luVG9wOiAxMiB9fSAvPlxuICAgIDwvZGl2PlxuICApXG59XG5cbmNvbnN0IHNlYXJjaEJveFN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLWNhcmQpXCIsXG4gIGJvcmRlcjogXCIxcHggc29saWQgdmFyKC0tYm9yZGVyKVwiLFxuICBib3JkZXJSYWRpdXM6IDE2LFxuICBwYWRkaW5nOiBcIjE2cHhcIixcbiAgbWFyZ2luOiBcIjRweCAwIDBcIixcbn1cblxuY29uc3QgaW5wdXRTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgZmxleDogMSwgbWluV2lkdGg6IDI0MCwgcGFkZGluZzogXCIxMXB4IDE0cHhcIiwgYm9yZGVyUmFkaXVzOiAxMixcbiAgYm9yZGVyOiBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpXCIsIGJhY2tncm91bmQ6IFwidmFyKC0tYmctZWxldilcIixcbiAgY29sb3I6IFwidmFyKC0tdGV4dClcIiwgZm9udFNpemU6IDE0LCBvdXRsaW5lOiBcIm5vbmVcIixcbiAgdHJhbnNpdGlvbjogXCJib3JkZXIgLjE1c1wiLFxufVxuXG5jb25zdCBzZWxlY3RTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgcGFkZGluZzogXCIxMXB4IDE0cHhcIiwgYm9yZGVyUmFkaXVzOiAxMiwgYm9yZGVyOiBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpXCIsXG4gIGJhY2tncm91bmQ6IFwidmFyKC0tYmctZWxldilcIiwgY29sb3I6IFwidmFyKC0tdGV4dClcIiwgZm9udFNpemU6IDE0LFxuICBjdXJzb3I6IFwicG9pbnRlclwiLFxufVxuXG5jb25zdCBzb3J0U2VsZWN0U3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIHBhZGRpbmc6IFwiNnB4IDEwcHhcIiwgYm9yZGVyUmFkaXVzOiA4LCBib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIixcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1lbGV2KVwiLCBjb2xvcjogXCJ2YXIoLS10ZXh0KVwiLCBmb250U2l6ZTogMTIuNSxcbiAgY3Vyc29yOiBcInBvaW50ZXJcIixcbn1cblxuY29uc3QgYnRuU3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIGRpc3BsYXk6IFwiaW5saW5lLWZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsIGdhcDogNixcbiAgcGFkZGluZzogXCIxMXB4IDIycHhcIiwgYm9yZGVyUmFkaXVzOiAxMiwgYm9yZGVyOiBcIm5vbmVcIixcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1hY2NlbnQpXCIsIGNvbG9yOiBcIiNmZmZcIiwgZm9udFdlaWdodDogNzAwLCBjdXJzb3I6IFwicG9pbnRlclwiLCBmb250U2l6ZTogMTQsXG4gIG1pbldpZHRoOiA5Mixcbn1cblxuY29uc3QgY2hpcFN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBmb250U2l6ZTogMTIuNSwgcGFkZGluZzogXCI1cHggMTFweFwiLCBib3JkZXJSYWRpdXM6IDIwLCBib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIixcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1lbGV2KVwiLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgY3Vyc29yOiBcInBvaW50ZXJcIixcbiAgdHJhbnNpdGlvbjogXCJhbGwgLjEyc1wiLFxufVxuXG5jb25zdCBiYWRnZVN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBkaXNwbGF5OiBcImlubGluZS1mbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogNSwgZm9udFNpemU6IDExLjUsXG4gIHBhZGRpbmc6IFwiNXB4IDEwcHhcIiwgYm9yZGVyUmFkaXVzOiAyMCwgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1zb2Z0KVwiLFxuICBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgYm9yZGVyOiBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpXCIsXG59XG5cbmNvbnN0IGJhbm5lclN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBkaXNwbGF5OiBcImlubGluZS1mbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogOCwgcGFkZGluZzogXCIxMHB4IDE0cHhcIixcbiAgYm9yZGVyUmFkaXVzOiAxMiwgZm9udFNpemU6IDEzLFxufVxuXG5jb25zdCB0b29sYmFyU3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIGRpc3BsYXk6IFwiZmxleFwiLCBqdXN0aWZ5Q29udGVudDogXCJzcGFjZS1iZXR3ZWVuXCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsXG4gIG1hcmdpbkJvdHRvbTogMTQsIGZsZXhXcmFwOiBcIndyYXBcIiwgZ2FwOiAxMCxcbn1cblxuY29uc3QgZ3JpZFN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBkaXNwbGF5OiBcImdyaWRcIiwgZ3JpZFRlbXBsYXRlQ29sdW1uczogXCJyZXBlYXQoYXV0by1maWxsLCBtaW5tYXgoMjIwcHgsIDFmcikpXCIsIGdhcDogMTQsXG59XG5cbmZ1bmN0aW9uIGNhcmRTdHlsZShhY3RpdmU6IGJvb2xlYW4pOiBDU1NQcm9wZXJ0aWVzIHtcbiAgcmV0dXJuIHtcbiAgICBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLWNhcmQpXCIsXG4gICAgYm9yZGVyOiBgMXB4IHNvbGlkICR7YWN0aXZlID8gXCJ2YXIoLS1hY2NlbnQpXCIgOiBcInZhcigtLWJvcmRlcilcIn1gLFxuICAgIGJvcmRlclJhZGl1czogMTYsIHBhZGRpbmc6IDE0LCBjdXJzb3I6IFwicG9pbnRlclwiLFxuICAgIHRyYW5zaXRpb246IFwidHJhbnNmb3JtIC4xMnMsIGJveC1zaGFkb3cgLjEycywgYm9yZGVyLWNvbG9yIC4xMnNcIixcbiAgICBib3hTaGFkb3c6IGFjdGl2ZSA/IFwiMCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1hY2NlbnQpIDIwJSwgdHJhbnNwYXJlbnQpXCIgOiB1bmRlZmluZWQsXG4gIH1cbn1cblxuY29uc3QgcGljV3JhcFN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICB3aWR0aDogXCIxMDAlXCIsIGFzcGVjdFJhdGlvOiBcIjEgLyAxXCIsIGJvcmRlclJhZGl1czogMTIsIG92ZXJmbG93OiBcImhpZGRlblwiLFxuICBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLXNvZnQpXCIsIHBvc2l0aW9uOiBcInJlbGF0aXZlXCIsXG59XG5cbmNvbnN0IHBpY1N0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICB3aWR0aDogXCIxMDAlXCIsIGhlaWdodDogXCIxMDAlXCIsIG9iamVjdEZpdDogXCJjb3ZlclwiLCBkaXNwbGF5OiBcImJsb2NrXCIsXG59XG5cbmNvbnN0IHBpY1BsYWNlaG9sZGVyU3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIHdpZHRoOiBcIjEwMCVcIiwgaGVpZ2h0OiBcIjEwMCVcIiwgZGlzcGxheTogXCJmbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxuICBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLCBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLXNvZnQpXCIsXG59XG5cbmNvbnN0IGR1cmF0aW9uQmFkZ2VTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgcG9zaXRpb246IFwiYWJzb2x1dGVcIiwgYm90dG9tOiA4LCByaWdodDogOCwgZm9udFNpemU6IDExLFxuICBiYWNrZ3JvdW5kOiBcInJnYmEoMCwwLDAsMC42NSlcIiwgY29sb3I6IFwiI2ZmZlwiLCBwYWRkaW5nOiBcIjJweCA3cHhcIixcbiAgYm9yZGVyUmFkaXVzOiA2LCBkaXNwbGF5OiBcImlubGluZS1mbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogMyxcbn1cblxuY29uc3QgbXZCYWRnZVN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLCB0b3A6IDgsIGxlZnQ6IDgsIGZvbnRTaXplOiAxMSxcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1hY2NlbnQpXCIsIGNvbG9yOiBcIiNmZmZcIiwgcGFkZGluZzogXCIycHggN3B4XCIsXG4gIGJvcmRlclJhZGl1czogNiwgZGlzcGxheTogXCJpbmxpbmUtZmxleFwiLCBhbGlnbkl0ZW1zOiBcImNlbnRlclwiLCBnYXA6IDMsXG59XG5cbmNvbnN0IHRhZ1N0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBmb250U2l6ZTogMTAuNSwgcGFkZGluZzogXCIycHggN3B4XCIsIGJvcmRlclJhZGl1czogNixcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1zb2Z0KVwiLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWRpbSlcIiwgYm9yZGVyOiBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpXCIsXG59XG5cbmNvbnN0IG1ldGFTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgZm9udFNpemU6IDExLCBjb2xvcjogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLCBkaXNwbGF5OiBcImlubGluZS1mbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGdhcDogMyxcbn1cblxuY29uc3QgcGxhY2Vob2xkZXJTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgbWFyZ2luVG9wOiA0MCwgdGV4dEFsaWduOiBcImNlbnRlclwiLCBwYWRkaW5nOiBcIjQwcHggMjBweFwiLCBib3JkZXJSYWRpdXM6IDE4LFxuICBib3JkZXI6IFwiMXB4IGRhc2hlZCB2YXIoLS1ib3JkZXIpXCIsIGJhY2tncm91bmQ6IFwidmFyKC0tYmctY2FyZClcIixcbn1cblxuY29uc3QgbW9kYWxPdmVybGF5U3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIHBvc2l0aW9uOiBcImZpeGVkXCIsIGluc2V0OiAwLCB6SW5kZXg6IDEwMCxcbiAgYmFja2dyb3VuZDogXCJyZ2JhKDAsMCwwLDAuNDUpXCIsIGJhY2tkcm9wRmlsdGVyOiBcImJsdXIoNHB4KVwiLFxuICBkaXNwbGF5OiBcImZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsIHBhZGRpbmc6IDIwLFxuICBvdmVyZmxvdzogXCJhdXRvXCIsXG59XG5cbmNvbnN0IG1vZGFsUGFuZWxTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1jYXJkKVwiLCBib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIiwgYm9yZGVyUmFkaXVzOiAyMCxcbiAgcGFkZGluZzogXCIyMnB4XCIsIHdpZHRoOiBcIjEwMCVcIiwgbWF4V2lkdGg6IDcyMCwgbWF4SGVpZ2h0OiBcIjkwdmhcIiwgb3ZlcmZsb3c6IFwiYXV0b1wiLFxuICBib3hTaGFkb3c6IFwiMCAyMHB4IDYwcHggcmdiYSgwLDAsMCwwLjI1KVwiLFxufVxuXG5jb25zdCBjb3ZlcldyYXBTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgd2lkdGg6IDIwMCwgaGVpZ2h0OiAyMDAsIGJvcmRlclJhZGl1czogMTYsIG92ZXJmbG93OiBcImhpZGRlblwiLFxuICBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLXNvZnQpIGNlbnRlci9jb3ZlclwiLCBkaXNwbGF5OiBcImZsZXhcIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsXG4gIGJveFNoYWRvdzogXCIwIDhweCAzMHB4IHJnYmEoMCwwLDAsMC4xMilcIixcbn1cblxuY29uc3Qgc3RhdHNHcmlkU3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIGRpc3BsYXk6IFwiZ3JpZFwiLCBncmlkVGVtcGxhdGVDb2x1bW5zOiBcInJlcGVhdChhdXRvLWZpbGwsIG1pbm1heCgxMTBweCwgMWZyKSlcIiwgZ2FwOiAxMCxcbn1cblxuY29uc3Qgc3RhdENhcmRTdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1lbGV2KVwiLCBib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIiwgYm9yZGVyUmFkaXVzOiAxMixcbiAgcGFkZGluZzogXCIxMnB4XCIsIHRleHRBbGlnbjogXCJjZW50ZXJcIixcbn1cblxuY29uc3QgcHJpbWFyeUJ0blN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBwYWRkaW5nOiBcIjEwcHggMTZweFwiLCBib3JkZXJSYWRpdXM6IDEwLCBiYWNrZ3JvdW5kOiBcInZhcigtLWFjY2VudClcIiwgY29sb3I6IFwiI2ZmZlwiLFxuICBmb250V2VpZ2h0OiA3MDAsIGZvbnRTaXplOiAxMywgdGV4dERlY29yYXRpb246IFwibm9uZVwiLFxufVxuXG5jb25zdCBzZWNvbmRhcnlCdG5TdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgcGFkZGluZzogXCIxMHB4IDE2cHhcIiwgYm9yZGVyUmFkaXVzOiAxMCwgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1lbGV2KVwiLCBjb2xvcjogXCJ2YXIoLS10ZXh0KVwiLFxuICBmb250V2VpZ2h0OiA2MDAsIGZvbnRTaXplOiAxMywgYm9yZGVyOiBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpXCIsIGN1cnNvcjogXCJwb2ludGVyXCIsXG59XG5cbmNvbnN0IGljb25CdG5TdHlsZTogQ1NTUHJvcGVydGllcyA9IHtcbiAgd2lkdGg6IDM0LCBoZWlnaHQ6IDM0LCBib3JkZXJSYWRpdXM6IDEwLCBib3JkZXI6IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIixcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1lbGV2KVwiLCBjb2xvcjogXCJ2YXIoLS10ZXh0KVwiLCBjdXJzb3I6IFwicG9pbnRlclwiLFxuICBkaXNwbGF5OiBcImlubGluZS1mbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxufVxuXG5jb25zdCByZWxhdGVkQ2FyZFN0eWxlOiBDU1NQcm9wZXJ0aWVzID0ge1xuICBiYWNrZ3JvdW5kOiBcInZhcigtLWJnLWVsZXYpXCIsIGJvcmRlcjogXCIxcHggc29saWQgdmFyKC0tYm9yZGVyKVwiLCBib3JkZXJSYWRpdXM6IDEyLFxuICBwYWRkaW5nOiAxMCwgY3Vyc29yOiBcInBvaW50ZXJcIiwgdHJhbnNpdGlvbjogXCJib3JkZXItY29sb3IgLjEyc1wiLFxufVxuXG5jb25zdCByZWxhdGVkUGljU3R5bGU6IENTU1Byb3BlcnRpZXMgPSB7XG4gIHdpZHRoOiBcIjEwMCVcIiwgYXNwZWN0UmF0aW86IFwiMSAvIDFcIiwgYm9yZGVyUmFkaXVzOiA4LCBvdmVyZmxvdzogXCJoaWRkZW5cIixcbiAgYmFja2dyb3VuZDogXCJ2YXIoLS1iZy1zb2Z0KSBjZW50ZXIvY292ZXJcIiwgZGlzcGxheTogXCJmbGV4XCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxuICBtYXJnaW5Cb3R0b206IDgsXG59XG4iXX0=