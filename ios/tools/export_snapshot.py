"""生成 iOS 内置离线快照 snapshot.json。

从运行中的 FastAPI 后端（默认 http://127.0.0.1:8010）拉取榜单数据，
按 iOS 端 Codable 模型裁剪字段后写入 ios/HuameiApp/snapshot.json。

用法：
    python ios/tools/export_snapshot.py [--base http://127.0.0.1:8010] [--issues 8]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime

BASE = "http://127.0.0.1:8010"
BOARD_TYPES = ["weekly", "legend", "annual"]  # 快照覆盖的榜单类型
# 与 iOS RankEntry 解码字段严格对齐（裁剪未知/超大字段，防止解码与体积失控）
ALLOWED = (
    "rank", "bvid", "title", "title_cn", "view", "favorite",
    "coin", "like", "share", "score", "pubtime", "best_rank",
)
ISSUE_FIELDS = ("issue", "date", "entries", "is_annual")


def _get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def export(num_issues: int) -> dict:
    boards: dict[str, dict] = {}
    for t in BOARD_TYPES:
        try:
            issues_raw = (_get(f"/api/boards/{t}/issues") or {}).get("issues") or []
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] {t}: 期次拉取失败，跳过该榜: {exc}", file=sys.stderr)
            continue
        issues = [{k: v for k, v in it.items() if k in ISSUE_FIELDS} for it in issues_raw]
        rankings: dict[str, list[dict]] = {}
        for it in issues_raw[:num_issues]:
            iss = it.get("issue")
            if not iss:
                continue
            try:
                items = (_get(f"/api/boards/{t}/issues/{iss}/rankings?top=50") or {}).get("items") or []
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] {t}/{iss}: 排名拉取失败: {exc}", file=sys.stderr)
                continue
            rankings[iss] = [{k: v for k, v in e.items() if k in ALLOWED} for e in items]
        boards[t] = {"issues": issues, "rankings": rankings}
        print(f"[ok] {t}: {len(issues)} 期 / {sum(len(v) for v in rankings.values())} 行")
    return {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "appVersion": "0.2.0.1-rc2",
        "boards": boards,
    }


def main() -> None:
    global BASE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=BASE)
    parser.add_argument("--issues", type=int, default=8, help="每种榜保留的期次数")
    parser.add_argument(
        "--out",
        default=os.path.join(os.path.dirname(__file__), "..", "HuameiApp", "snapshot.json"),
    )
    args = parser.parse_args()
    BASE = args.base
    snapshot = export(args.issues)
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, separators=(",", ":"))
    rows = sum(len(rs) for b in snapshot["boards"].values() for rs in b["rankings"].values())
    print(f"done: {out}  size={os.path.getsize(out) / 1024:.1f}KB  rows={rows}")


if __name__ == "__main__":
    main()