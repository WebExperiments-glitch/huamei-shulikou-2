import sqlite3

DB = r"D:\DeepSeek前端代码\前端\未确定\术力口周榜\biliboard-database\表格写入sqlite\biliboard (11).db"
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row


def names(raw):
    """从 JSON 解析名称列表"""
    import json
    try:
        v = json.loads(raw or "[]")
    except Exception:
        return []
    return [x.get("name") for x in v if isinstance(x, dict)]

# 解析后 name 为空的（而非仅 [] 字符串）
rows = c.execute("SELECT bvid, title, title_cn, producers, vocalists FROM songs_all").fetchall()
no_p = [r for r in rows if not names(r["producers"])]
no_v = [r for r in rows if not names(r["vocalists"])]
print(f"解析后无 P主名: {len(no_p)}")
for r in no_p:
    print(f"  {r['bvid']} | {r['title_cn'] or r['title'] or '-'}")
print(f"解析后无歌姬名: {len(no_v)}")
for r in no_v:
    print(f"  {r['bvid']} | {r['title_cn'] or r['title'] or '-'}")

# 也有 P主 也有歌姬的数量
both = [r for r in rows if names(r["producers"]) and names(r["vocalists"])]
print(f"同时有 P主+歌姬: {len(both)} / {len(rows)}")
