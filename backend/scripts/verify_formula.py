# -*- coding: utf-8 -*-
"""用用户提供的 6 首歌周榜历史数据，逐行验证得分公式与时间修正。

每行给出：期数/排名/播放/点赞/投币/收藏/得分/环比/时间修正/上周或前十/在榜/最高
播放/点赞/投币/收藏 视为「本期新增量」（delta）。

按期数自动选择公式代，反推该代权重下的隐含 t 并与显示 t 对比：
  · 中间公式（54 ≤ issue < 98）：得分 = Δ播放×t + 30Δ收藏 + 3Δ点赞 + 10Δ投币
        → t30_10 = (score - fav*30 - like*3 - coin*10) / view
  · 现行公式（issue ≥ 98）：得分 = Δ播放×t + 15Δ收藏 + 3Δ点赞 + 30Δ投币
        → t15_30 = (score - fav*15 - like*3 - coin*30) / view
"""
# 公式分代（与 backend/app/services/rank.py 保持一致）
MID_FROM, CUR_FROM = 54, 98

# 每行: (期数, 播放, 点赞, 投币, 收藏, 得分, 显示t, 备注)
ROWS = [
    # 灯神先生 BV1GzV36pE5h 投稿 2026-05-30
    dict(issue=104, view=592370, like=65466, coin=18550, fav=56457, score=2767070, t=1.97, note="灯神 新曲"),
    dict(issue=105, view=2515403, like=172133, coin=50334, fav=170772, score=7103402, t=1.00, note="灯神"),
    dict(issue=106, view=2246250, like=101189, coin=29914, fav=93829, score=4854672, t=1.00, note="灯神"),
    dict(issue=107, view=1653302, like=74626, coin=23148, fav=62600, score=3510620, t=1.00, note="灯神"),
    dict(issue=108, view=1361420, like=63044, coin=18207, fav=49463, score=2838707, t=1.00, note="灯神"),
    dict(issue=109, view=1202174, like=51175, coin=14174, fav=39276, score=2370059, t=1.00, note="灯神"),
    dict(issue=110, view=1247788, like=58426, coin=15326, fav=38795, score=2464771, t=1.00, note="灯神"),
    dict(issue=111, view=890661, like=33848, coin=9185, fav=25103, score=1644300, t=1.00, note="灯神"),
    dict(issue=112, view=713906, like=26791, coin=7126, fav=18766, score=1289549, t=1.00, note="灯神"),
    dict(issue=113, view=643625, like=24083, coin=6768, fav=18067, score=1189919, t=1.00, note="灯神"),
    dict(issue=114, view=522658, like=14968, coin=4062, fav=13025, score=884797, t=1.00, note="灯神"),
    # 麻麻木木 BV1SKLD6NEdC 投稿 2026-06-17
    dict(issue=103, view=241461, like=46474, coin=15444, fav=31534, score=1362610, t=12.70, note="麻麻木木 新曲"),
    dict(issue=104, view=311317, like=50904, coin=8873, fav=41321, score=1350034, t=9.66, note="麻麻木木"),
    dict(issue=105, view=231068, like=28727, coin=6162, fav=22566, score=840599, t=6.62, note="麻麻木木"),
    dict(issue=106, view=258045, like=28041, coin=6017, fav=22719, score=863463, t=3.58, note="麻麻木木"),
    dict(issue=107, view=1106747, like=215352, coin=82172, fav=140123, score=6462653, t=1.13, note="麻麻木木"),
    dict(issue=108, view=834137, like=117307, coin=42917, fav=80742, score=3684698, t=1.00, note="麻麻木木"),
    dict(issue=109, view=674009, like=80029, coin=28921, fav=54413, score=2597921, t=1.00, note="麻麻木木"),
    dict(issue=110, view=668231, like=69186, coin=25390, fav=47269, score=2346524, t=1.00, note="麻麻木木"),
    dict(issue=111, view=475024, like=41116, coin=15013, fav=30477, score=1505917, t=1.00, note="麻麻木木"),
    dict(issue=112, view=465568, like=40547, coin=13803, fav=30196, score=1454239, t=1.00, note="麻麻木木"),
    dict(issue=113, view=402204, like=31888, coin=10811, fav=24697, score=1192653, t=1.00, note="麻麻木木"),
    dict(issue=114, view=321593, like=22992, coin=7822, fav=18899, score=908714, t=1.00, note="麻麻木木"),
    # 世界去死 BV1DBQnBBEmY 投稿 2026-04-15
    dict(issue=99, view=171929, like=29225, coin=4991, fav=23111, score=755999, t=1.00, note="世界去死"),
    dict(issue=98, view=127943, like=43579, coin=5261, fav=19109, score=723885, t=1.16, note="世界去死 重投"),
    # 等离子·雷霆·超新星 BV1Qkun6vEgb 投稿 2026-08-07
    dict(issue=114, view=421174, like=92975, coin=23782, fav=55748, score=2510808, t=1.62, note="等离子 新曲"),
    # SWIPE×SWIPE BV1aGGV6REZh 投稿 2026-08-04
    dict(issue=114, view=390811, like=38297, coin=5672, fav=29749, score=1122097, t=1.05, note="SWIPE"),
    dict(issue=113, view=265370, like=62161, coin=3965, fav=34008, score=1343663, t=3.12, note="SWIPE 新曲"),
    # 角色T BV1nk9fBTEkE 投稿 2026-05-03
    dict(issue=103, view=202776, like=10768, coin=3578, fav=9989, score=492255, t=1.00, note="角色T"),
    dict(issue=102, view=329070, like=18676, coin=5988, fav=17618, score=829008, t=1.00, note="角色T"),
    dict(issue=101, view=471568, like=37292, coin=11666, fav=33300, score=1432924, t=1.00, note="角色T"),
    dict(issue=100, view=315804, like=46210, coin=16328, fav=34965, score=1907876, t=2.39, note="角色T 新曲"),
]


def implied_t(row, w_fav, w_coin):
    return (row["score"] - row["fav"] * w_fav - row["like"] * 3 - row["coin"] * w_coin) / row["view"]


def pick_weights(issue):
    """按期数返回 (代名, 收藏权重, 投币权重, 隐含t字段名)。"""
    if issue < MID_FROM:
        return ("远古", None, None, None)
    if issue < CUR_FROM:
        return ("中间", 30, 10, "t30_10")
    return ("现行", 15, 30, "t15_30")


print(f"{'期':>4} {'代':>4} {'t显示':>7} {'隐含t':>9} {'匹配':>6} 备注")
print("-" * 76)
ok, fail = 0, 0
for r in ROWS:
    gen, w_fav, w_coin, field = pick_weights(r["issue"])
    if w_fav is None:
        print(f"{r['issue']:>4} {gen:>4} {r['t']:>7.2f} {'--':>9} {'--':>6} {r['note']}")
        continue
    t_impl = implied_t(r, w_fav, w_coin)
    t_show = r["t"]
    if abs(t_impl - t_show) < 0.02:
        matched = "OK"
        ok += 1
    else:
        matched = "FAIL"
        fail += 1
    print(f"{r['issue']:>4} {gen:>4} {t_show:>7.2f} {t_impl:>9.4f} {matched:>6} {r['note']}")

print("-" * 76)
print(f"匹配 {ok} 行，不匹配 {fail} 行")
