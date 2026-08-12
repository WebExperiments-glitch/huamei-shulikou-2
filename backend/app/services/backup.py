"""真源数据库冗余备份（多重冗余第一道防线）。

设计目标：
- 任何会写入真源库（SOURCE_DB）的操作（官方同步 / 月榜重建 / 补抓）之前，
  先对真源库做一次时间点副本，确保「不可逆真源库」永远有可回滚的恢复点。
- 备份采用「复制整个 .db 文件 + 同目录 WAL/SHM 伴随文件」的方式，
  保证副本在事务边界上一致（sqlite 单文件副本在写空闲期是安全的；
  若担心并发写，调用方应在备份期间避免并发写入，sync 脚本本身是串行的）。
- 保留策略：默认保留最近 RETAIN 份（按文件名时间戳降序淘汰最旧）。
- 绝不删除源文件，绝不触碰其他目录；备份目录与源库同父目录下的 backups/。

纯增量不可行（sqlite 单库），故采用整库副本 + 轮转，简单可靠、可独立 restore。
"""
from __future__ import annotations

import logging
import re
import shutil
import time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# 备份目录名（位于源库同父目录下）
BACKUP_DIRNAME = "backups"
# 保留份数（轮转）
RETAIN = 10
# 单次备份最大允许大小（8 GB 兜底，防止误备份超大文件卡死）
MAX_BYTES = 8 * 1024 * 1024 * 1024


def _backup_dir(source: Path) -> Path:
    d = source.parent / BACKUP_DIRNAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def backup_database(source_db: str | Path, *,
                    retain: int = RETAIN,
                    label: str = "sync") -> str | None:
    """对真源库做时间点副本，返回备份文件路径；失败返回 None（不抛异常，避免阻断主流程）。

    source_db: 源库路径（str 或 Path）。
    label: 备份用途标签（sync / monthly / backfill），写入文件名便于辨识。
    retain: 保留最近多少份（含本次）。
    返回备份文件绝对路径，或 None（仅记日志）。
    """
    try:
        src = Path(source_db).resolve()
        if not src.exists():
            logger.warning("[backup] 源库不存在，跳过备份: %s", src)
            return None
        size = src.stat().st_size
        if size > MAX_BYTES:
            logger.warning("[backup] 源库过大(%d字节)超过上限，跳过自动备份", size)
            return None

        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        stamp = f"{ts}_{label}"
        out_dir = _backup_dir(src)
        dst = out_dir / f"{src.stem}.{stamp}{src.suffix}"
        # 复制主库文件
        shutil.copy2(src, dst)
        # 复制 WAL / SHM 伴随文件（若存在），保证副本一致性
        for ext in (".wal", ".shm"):
            comp = src.with_suffix(src.suffix + ext) if src.suffix else None
            # sqlite 伴随文件命名：<db>.wal / <db>.shm
            comp = src.parent / (src.name + ext)
            if comp.exists():
                try:
                    shutil.copy2(comp, out_dir / (dst.name + ext))
                except OSError as e:  # 并发写导致临时不可读，忽略伴随文件
                    logger.warning("[backup] 伴随文件复制失败(可忽略): %s (%s)", comp, e)
        logger.info("[backup] 已备份 %s -> %s (%.1f MB)", src.name, dst.name, size / 1e6)

        # 轮转：保留最近 retain 份
        _prune(out_dir, src.stem + ".", retain)
        return str(dst)
    except Exception as e:  # noqa: BLE001
        logger.exception("[backup] 备份失败(不影响主流程): %s", e)
        return None


def _prune(out_dir: Path, prefix: str, retain: int) -> None:
    """淘汰超出保留份数的最旧备份（仅删 backups/ 内、本库前缀的副本）。"""
    pat = re.compile(r"^\d{8}_\d{6}")  # 时间戳前缀 YYYYMMDD_HHMMSS
    try:
        matches = [p for p in out_dir.glob(f"{prefix}*")
                   if p.is_file() and p.name.startswith(prefix)
                   and pat.match(p.name[len(prefix):])]
        matches.sort(key=lambda p: p.name, reverse=True)
        for old in matches[retain:]:
            try:
                old.unlink()
                # 一并清理其伴随文件
                for ext in (".wal", ".shm"):
                    comp = old.parent / (old.name + ext)
                    if comp.exists():
                        comp.unlink()
                logger.info("[backup] 轮转淘汰旧备份: %s", old.name)
            except OSError as e:
                logger.warning("[backup] 淘汰旧备份失败: %s (%s)", old, e)
    except Exception as e:  # noqa: BLE001
        logger.warning("[backup] 轮转异常(忽略): %s", e)


def list_backups(source_db: str | Path) -> list[str]:
    """列出某源库的现有备份（按时间降序），供运维/手动 restore 参考。"""
    src = Path(source_db).resolve()
    out_dir = _backup_dir(src)
    pat = re.compile(r"^\d{8}_\d{6}")
    matches = [str(p) for p in out_dir.glob(f"{src.stem}.*")
               if p.is_file() and p.name.startswith(src.stem + ".")
               and pat.match(p.name[len(src.stem) + 1:])]
    matches.sort(reverse=True)
    return matches


def restore_from(source_db: str | Path, backup_path: str | Path) -> bool:
    """从指定备份恢复真源库（覆盖写）。高风险操作，需调用方显式确认后使用。

    安全约束：
    - backup_path 必须位于源库 backups/ 目录内（防止误写任意路径）。
    - 恢复前会自动对「当前源库」再备一份（restore_<ts>）作为二次保险。
    """
    try:
        src = Path(source_db).resolve()
        bk = Path(backup_path).resolve()
        if bk.parent.name != BACKUP_DIRNAME or bk.parent.parent != src.parent:
            logger.error("[backup] 拒绝恢复：备份路径不在源库 backups/ 内: %s", bk)
            return False
        if not bk.exists():
            logger.error("[backup] 备份文件不存在: %s", bk)
            return False
        # 二次保险：恢复前先备当前态
        pre = backup_database(src, retain=RETAIN, label="prerestore")
        logger.info("[backup] 恢复前二次保险: %s", pre)
        shutil.copy2(bk, src)
        for ext in (".wal", ".shm"):
            comp = bk.parent / (bk.name + ext)
            if comp.exists():
                shutil.copy2(comp, src.parent / (src.name + ext))
        logger.warning("[backup] 已从 %s 恢复 %s —— 请重启后端使连接生效", bk.name, src.name)
        return True
    except Exception as e:  # noqa: BLE001
        logger.exception("[backup] 恢复失败: %s", e)
        return False
