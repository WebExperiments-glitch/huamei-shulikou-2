import sqlite3

DB = r"D:\DeepSeek前端代码\前端\未确定\术力口周榜\biliboard-database\表格写入sqlite\biliboard (11).db"
c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row

total = c.execute("SELECT COUNT(*) FROM songs_all").fetchone()[0]
nop = c.execute(
    "SELECT COUNT(*) FROM songs_all WHERE producers IS NULL OR producers='' OR producers='[]'"
).fetchone()[0]
nov = c.execute(
    "SELECT COUNT(*) FROM songs_all WHERE vocalists IS NULL OR vocalists='' OR vocalists='[]'"
).fetchone()[0]
print(f"总歌曲: {total}")
print(f"无P主: {nop} ({nop/total*100:.1f}%)")
print(f"无歌姬: {nov} ({nov/total*100:.1f}%)")

print("--- 有P主的样例 ---")
for s in c.execute(
    "SELECT bvid, title_cn, producers, vocalists FROM songs_all "
    "WHERE producers IS NOT NULL AND producers!='' AND producers!='[]' LIMIT 5"
):
    print(f'  {s["bvid"]} | {s["title_cn"] or "-"} | P:{s["producers"]} | V:{s["vocalists"]}')

print("--- 无P主的样例 ---")
for s in c.execute(
    "SELECT bvid, title_cn, producers, vocalists FROM songs_all "
    "WHERE producers IS NULL OR producers='' OR producers='[]' LIMIT 5"
):
    print(f'  {s["bvid"]} | {s["title_cn"] or "-"} | P:{s["producers"]} | V:{s["vocalists"]}')
