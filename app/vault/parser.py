"""
Parse Eagle vault on disk: library metadata.json (folder tree) and
images/*.info/metadata.json (items). Build an in-memory index per library.

Each library is a ``LibraryIndex``. Its parsed records are persisted to a local
cache (one gzip NDJSON file per library) so that a restart can serve the
library immediately and then re-read only the ``.info`` dirs whose stats
changed. Module-level helpers (``get_item`` etc.) operate on the library that
the current request selected (see ``use_library``) or on the default library.
"""
import contextlib
import contextvars
import gzip
import hashlib
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.vault.models import FolderNode, ItemInfo

logger = logging.getLogger(__name__)

# アプリのバージョン（唯一の出どころ = pyproject.toml）。フロントエンドの表示に使う。
try:
    from importlib.metadata import version as _pkg_version
    APP_VERSION = _pkg_version("eagle-viewer")
except Exception:  # pragma: no cover - パッケージ未インストール時は pyproject.toml から読む
    import tomllib
    _pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
    try:
        with open(_pyproject, "rb") as _f:
            APP_VERSION = tomllib.load(_f)["project"]["version"]
    except Exception:
        APP_VERSION = "0.0.0"

# Bump when the parsed record layout or the parsing rules change; old caches are ignored.
CACHE_FORMAT = 1
# Libraries above this size only recompute the deep (per-item stat) revision this often.
DEEP_STATUS_LARGE_LIBRARY = 20000
DEEP_STATUS_LARGE_INTERVAL_S = 30 * 60
# While indexing without a cache, write a resumable checkpoint this often.
CHECKPOINT_INTERVAL_S = 60.0

# Used only for preferring image/video as thumbnail; main file can be any type
PREFERRED_MEDIA_EXTENSIONS = {
    ".bmp", ".gif", ".heic", ".heif", ".ico", ".jpeg", ".jpg", ".png",
    ".svg", ".tif", ".tiff", ".webp", ".avif", ".jfif", ".jxl",
    ".mp4", ".webm", ".mov", ".m4v", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
    ".pdf", ".txt", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".psd", ".ai", ".sketch", ".fig", ".xd", ".ttf", ".otf", ".woff", ".woff2",
}

# Type filter: image, video, document, audio, other (ext lowercase without dot)
IMAGE_EXTS = {"bmp", "gif", "heic", "heif", "ico", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp", "avif", "jfif", "jxl"}
VIDEO_EXTS = {"mp4", "webm", "mov", "m4v", "avi", "mkv", "flv", "wmv"}
AUDIO_EXTS = {"mp3", "wav", "m4a", "aac", "flac", "ogg", "wma"}
DOCUMENT_EXTS = {"pdf", "txt", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "xmind", "mindnode", "graffle", "numbers", "psd", "ai", "sketch", "fig", "xd", "ttf", "otf", "woff", "woff2"}
VALID_TYPE_FILTERS = {"all", "image", "video", "document", "audio", "other"}
VALID_SORT_FIELDS = {"mtime", "btime", "name", "size", "ext", "star"}
VALID_SORT_DIR = {"asc", "desc"}
# Rating filter: all, unrated, or a minimum star count "1".."5"
VALID_RATING_FILTERS = {"all", "unrated", "1", "2", "3", "4", "5"}

# Sort cache budget in list slots (each cached ordering costs ~16 bytes per item incl. its key).
SORT_CACHE_MAX_SLOTS = 600_000


class LibraryLoadCancelled(Exception):
    """Raised inside a load when the library was evicted while indexing."""


class RatingWriteError(Exception):
    """Writing a star rating failed; ``status`` is the HTTP status to report."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _stat_line(label: str, path: str) -> bytes:
    try:
        st = os.stat(path)
        value = f"{label}\0{st.st_mtime_ns}\0{st.st_size}\n"
    except OSError:
        value = f"{label}\0missing\n"
    return value.encode("utf-8", errors="surrogatepass")


def _meta_line(label: str, msig: tuple[int, int] | None) -> bytes:
    if msig is None:
        value = f"{label}\0missing\n"
    else:
        value = f"{label}\0{msig[0]}\0{msig[1]}\n"
    return value.encode("utf-8", errors="surrogatepass")


def _list_info_dirs(images_dir: str) -> list[str]:
    try:
        with os.scandir(images_dir) as it:
            names = [entry.name for entry in it if entry.name.endswith(".info") and entry.is_dir()]
    except OSError:
        return []
    names.sort()
    return names


def _stat_sig(path: str) -> tuple[int, int] | None:
    try:
        st = os.stat(path)
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size)


def _source_revision_for_root(root: str, deep: bool = False) -> str:
    """Return a read-only fingerprint of an Eagle library.

    The shallow form is cheap enough for foreground polling. The deep form also
    includes every item metadata file to catch tag/note/rating edits.
    """
    images_dir = os.path.join(root, "images")
    digest = hashlib.sha256()
    digest.update(_stat_line("library", os.path.join(root, "metadata.json")))
    digest.update(_stat_line("images", images_dir))
    if deep and os.path.isdir(images_dir):
        for name in _list_info_dirs(images_dir):
            digest.update(_meta_line(name, _stat_sig(os.path.join(images_dir, name, "metadata.json"))))
    return digest.hexdigest()[:24]


def _load_library_metadata(root: str) -> dict[str, Any]:
    path = Path(root) / "metadata.json"
    if not path.exists():
        return {"folders": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_folders_data(lib: dict[str, Any]) -> list[dict]:
    """Extract folder tree as list of root nodes. Handles array, { children: [] }, single root, or { "0": f0, "1": f1 }."""
    raw = lib.get("folders")
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        if "children" in raw and isinstance(raw["children"], list):
            return raw["children"]
        if "id" in raw and "children" not in raw:
            return [raw]
        vals = [v for v in raw.values() if isinstance(v, dict) and v.get("id") is not None]
        if vals:
            return vals
    return []


def _collect_locked_folder_ids(folders_data: list[dict]) -> set[str]:
    """Return password-protected folder IDs and every descendant ID."""
    locked: set[str] = set()
    if not folders_data:
        return locked
    is_flat = any("parent" in entry for entry in folders_data)
    if is_flat:
        by_id = {str(entry.get("id")): entry for entry in folders_data if entry.get("id") is not None}
        locked.update(folder_id for folder_id, entry in by_id.items() if entry.get("password"))
        changed = True
        while changed:
            changed = False
            for folder_id, entry in by_id.items():
                parent_id = str(entry.get("parent")) if entry.get("parent") is not None else ""
                if folder_id not in locked and parent_id in locked:
                    locked.add(folder_id)
                    changed = True
        return locked

    def visit(entry: dict, inherited_locked: bool = False) -> None:
        folder_id = str(entry.get("id")) if entry.get("id") is not None else ""
        entry_locked = inherited_locked or bool(entry.get("password"))
        if entry_locked and folder_id:
            locked.add(folder_id)
        for child in entry.get("children", []):
            if isinstance(child, dict):
                visit(child, entry_locked)

    for entry in folders_data:
        visit(entry)
    return locked


def _build_folder_node(data: dict[str, Any], locked_folder_ids: set[str], parent_id: str | None = None) -> FolderNode:
    """Build one node from nested format (has 'children' array). Sets parent so path from root works."""
    node_id = str(data["id"]) if data.get("id") is not None else ""
    node = FolderNode(
        id=node_id,
        name=data.get("name", ""),
        description=data.get("description", ""),
        parent=str(data["parent"]) if data.get("parent") is not None else (str(parent_id) if parent_id else None),
        locked=node_id in locked_folder_ids,
        cover_id=str(data.get("coverId") or ""),
        children=[],
    )
    if node.locked:
        return node
    for child in data.get("children", []):
        child_node = _build_folder_node(child, locked_folder_ids, parent_id=node.id)
        node.children.append(child_node)
    return node


def _build_folder_tree_from_flat(folders_data: list[dict], locked_folder_ids: set[str]) -> list[FolderNode]:
    """Build tree from flat list where each folder has optional 'parent' id."""
    if not folders_data:
        return []
    nodes: dict[str, FolderNode] = {}
    for f in folders_data:
        nid = str(f["id"]) if f.get("id") is not None else ""
        pid = f.get("parent")
        n = FolderNode(
            id=nid,
            name=f.get("name", ""),
            description=f.get("description", ""),
            parent=str(pid) if pid is not None else None,
            locked=nid in locked_folder_ids,
            cover_id=str(f.get("coverId") or ""),
            children=[],
        )
        nodes[n.id] = n
    roots: list[FolderNode] = []
    for n in nodes.values():
        if n.parent is None or n.parent == "" or n.parent not in nodes:
            roots.append(n)
        elif not nodes[n.parent].locked:
            nodes[n.parent].children.append(n)
    return roots


def _build_folder_tree(folders_data: list[dict], locked_folder_ids: set[str]) -> list[FolderNode]:
    """Build folder tree. Supports both nested (children) and flat (parent) format."""
    if not folders_data:
        return []
    first = folders_data[0]
    # If any folder has 'parent' key, treat as flat list
    if "parent" in first or any("parent" in f for f in folders_data):
        return _build_folder_tree_from_flat(folders_data, locked_folder_ids)
    roots: list[FolderNode] = []
    for f in folders_data:
        roots.append(_build_folder_node(f, locked_folder_ids, parent_id=None))
    return roots


def _find_main_file(info_dir: Path, vault_root: Path) -> tuple[str, str]:
    """Return (main_file_path, thumbnail_path). Any file except metadata/thumbnail is valid as main."""
    main_path = ""
    main_candidate_media = ""  # prefer image/video for "main" if multiple
    thumb_path = ""
    for f in sorted(info_dir.iterdir(), key=lambda p: p.name.lower()):
        if f.is_dir():
            continue
        name_lower = f.name.lower()
        if name_lower == "metadata.json":
            continue
        if name_lower.startswith(".") and name_lower.endswith(".tmp"):
            continue  # our own in-flight rating write
        if "thumbnail" in name_lower:
            try:
                resolved_thumb = f.resolve(strict=True)
            except OSError:
                continue
            if not resolved_thumb.is_relative_to(vault_root):
                logger.warning("Skipping Vault thumbnail outside root: %s", f)
                continue
            thumb_path = str(resolved_thumb)
            continue
        try:
            resolved_path = f.resolve(strict=True)
        except OSError:
            continue
        if not resolved_path.is_relative_to(vault_root):
            logger.warning("Skipping Vault file outside root: %s", f)
            continue
        resolved = str(resolved_path)
        if not main_path:
            main_path = resolved
        if f.suffix.lower() in PREFERRED_MEDIA_EXTENSIONS and not main_candidate_media:
            main_candidate_media = resolved
    # Prefer a known media file as main when present (for preview); else use first file
    if main_candidate_media:
        main_path = main_candidate_media
    return main_path, thumb_path


def _normalize_item_folder_ids(raw_folders: Any) -> list[str]:
    """Normalize item metadata 'folders' to list of folder id strings. Handles array, dict, or single value."""
    if raw_folders is None:
        return []
    if isinstance(raw_folders, list):
        return [str(x) for x in raw_folders if x is not None]
    if isinstance(raw_folders, dict):
        # e.g. {"0": "id1", "1": "id2"} -> use values
        return [str(v) for v in raw_folders.values() if v is not None]
    return [str(raw_folders)]


def _normalize_source_domain(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    candidate = raw if "://" in raw else f"https://{raw}"
    host = urlparse(candidate).hostname or raw.split("/", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host[:255]


def _nonnegative_float(value: Any) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def _parse_star(value: Any) -> int:
    """Eagle stores the rating as ``"star": 1..5``; anything else counts as unrated."""
    try:
        star = int(value or 0)
    except (TypeError, ValueError):
        return 0
    return star if 1 <= star <= 5 else 0


def _item_from_meta(meta: dict, main_path: str, thumb_path: str) -> ItemInfo:
    return ItemInfo(
        id=meta["id"],
        name=meta.get("name", ""),
        ext=meta.get("ext", ""),
        folders=_normalize_item_folder_ids(meta.get("folders", [])),
        width=meta.get("width", 0),
        height=meta.get("height", 0),
        size=meta.get("size", 0),
        tags=meta.get("tags", []),
        url=meta.get("url", ""),
        annotation=meta.get("annotation", ""),
        duration=_nonnegative_float(meta.get("duration")),
        bpm=_nonnegative_float(meta.get("bpm")),
        btime=meta.get("btime", meta.get("creationTime", 0)),
        mtime=meta.get("modificationTime", meta.get("mtime", 0)),
        star=_parse_star(meta.get("star")),
        main_file_path=main_path,
        thumbnail_path=thumb_path,
    )


# Order of ItemInfo fields inside a cache row (keep in sync with CACHE_FORMAT).
_ROW_FIELDS = (
    "id", "name", "ext", "folders", "width", "height", "size", "tags", "url", "annotation",
    "duration", "bpm", "btime", "mtime", "star", "main_file_path", "thumbnail_path",
)


def _item_to_row(item: ItemInfo) -> list:
    return [getattr(item, name) for name in _ROW_FIELDS]


def _item_from_row(row: list) -> ItemInfo:
    return ItemInfo(**dict(zip(_ROW_FIELDS, row)))


def _parse_info_dir(info_dir: str, vault_root: Path) -> tuple[ItemInfo | None, str]:
    """Parse one ``.info`` dir. Returns (item, reason); item is None unless reason is "ok".

    Lock filtering is applied later (it depends on the library folder tree), so locked
    items are still parsed and cached here.
    """
    name = os.path.basename(info_dir)
    meta_path = Path(info_dir) / "metadata.json"
    if not meta_path.exists():
        logger.warning("Skipping item %s: metadata.json missing", name)
        return None, "missing_metadata"
    try:
        if not meta_path.resolve(strict=True).is_relative_to(vault_root):
            logger.warning("Skipping metadata outside Vault root: %s", meta_path)
            return None, "bad_metadata"
    except OSError:
        logger.warning("Skipping unresolved metadata: %s", meta_path)
        return None, "bad_metadata"
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        logger.warning("Skipping item %s: unreadable metadata (%s)", name, exc)
        return None, "bad_metadata"
    if not isinstance(meta, dict) or "id" not in meta:
        logger.warning("Skipping item %s: metadata has no id", name)
        return None, "bad_metadata"
    if meta.get("isDeleted"):
        return None, "deleted"
    try:
        main_path, thumb_path = _find_main_file(Path(info_dir), vault_root)
    except OSError:
        main_path, thumb_path = "", ""
    if not main_path:
        logger.warning("Skipping item %s: no main file found", name)
        return None, "missing_file"
    return _item_from_meta(meta, main_path, thumb_path), "ok"


_SKIP_STAT_KEYS = {
    "missing_metadata": "skipped_missing_metadata",
    "bad_metadata": "skipped_bad_metadata",
    "deleted": "skipped_deleted",
    "missing_file": "skipped_missing_file",
}


def _build_tag_index(items_by_id: dict[str, ItemInfo]) -> tuple[dict[str, list[ItemInfo]], list[dict]]:
    by_tag: dict[str, list[ItemInfo]] = {}
    counts: dict[str, int] = {}
    for item in items_by_id.values():
        for tag in item.tags or []:
            if not tag:
                continue
            by_tag.setdefault(tag, []).append(item)
            counts[tag] = counts.get(tag, 0) + 1
    summary = [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0].lower()))
    ]
    return by_tag, summary


def _collect_folder_by_id(nodes: list[FolderNode], out: dict) -> None:
    for n in nodes:
        if n.id:
            out[n.id] = n
            # Index by int too when id is numeric (Eagle may use number in JSON)
            try:
                if str(int(n.id)) == n.id:
                    out[int(n.id)] = n
            except (ValueError, TypeError):
                pass
        _collect_folder_by_id(n.children, out)


def _find_node_in_tree(nodes: list[FolderNode], folder_id: str) -> FolderNode | None:
    """Find folder node by id by walking the tree (fallback when not in folder_by_id)."""
    fid = str(folder_id).strip() if folder_id is not None else ""
    if not fid:
        return None
    for n in nodes:
        if str(n.id).strip() == fid:
            return n
        found = _find_node_in_tree(n.children, folder_id)
        if found:
            return found
    return None


def _compute_folder_counts(
    nodes: list[FolderNode],
    items_by_folder: dict[str, list[ItemInfo]],
) -> dict[str, int]:
    counts: dict[str, int] = {}

    def walk(node: FolderNode) -> int:
        total = len(items_by_folder.get(node.id, []))
        for child in node.children:
            total += walk(child)
        counts[node.id] = total
        return total

    for node in nodes:
        walk(node)
    return counts


# Per dir: (sig, item_or_None, reason). sig = (dir_mtime_ns, meta_mtime_ns, meta_size) with -1 for missing.
Entry = tuple[tuple[int, int, int], "ItemInfo | None", str]


@dataclass
class IndexData:
    """One immutable-ish snapshot of a parsed library. Swapped atomically on reload."""
    root: str
    folder_tree: list[FolderNode]
    folder_by_id: dict
    items_by_id: dict[str, ItemInfo]
    items_by_folder: dict[str, list[ItemInfo]]
    items_by_tag: dict[str, list[ItemInfo]]
    tag_summary: list[dict]
    folder_counts: dict[str, int]
    locked_folder_ids: set[str]
    entries: dict[str, Entry]
    stats: dict[str, Any]
    header_lines: tuple[bytes, bytes] = (b"", b"")
    folder_path_cache: dict[str, str] = field(default_factory=dict)
    sort_cache: dict = field(default_factory=dict)
    sort_cache_slots: int = 0


def _deep_revision_from_entries(header_lines: tuple[bytes, bytes], entries: dict[str, Entry]) -> str:
    digest = hashlib.sha256()
    digest.update(header_lines[0])
    digest.update(header_lines[1])
    for name in sorted(entries):
        sig = entries[name][0]
        digest.update(_meta_line(name, None if sig[1] < 0 else (sig[1], sig[2])))
    return digest.hexdigest()[:24]


class LibraryIndex:
    """In-memory index of one Eagle library plus its on-disk parse cache."""

    def __init__(self, root: str, lib_id: str = "default", name: str = "", cache_dir: str = "", editable: bool = False):
        self.root = str(root)
        self.id = lib_id
        self.name = name or Path(self.root).name.removesuffix(".library")
        self.cache_dir = cache_dir
        self.editable = editable
        self.data: IndexData | None = None
        self.state = "unloaded"  # unloaded | loading | ready | error
        self.error = ""
        self.progress: dict[str, int] | None = None
        self.verifying = False
        self.failed_at = 0.0
        self.last_used = 0.0
        self.load_lock = threading.Lock()
        self.cancel_event = threading.Event()
        self._deep_status: tuple[float, str] = (0.0, "")
        self._write_lock = threading.Lock()
        self._item_locks: dict[str, threading.Lock] = {}

    # ---------- cache files ----------
    def _cache_path(self) -> Path | None:
        if not self.cache_dir:
            return None
        return Path(self.cache_dir) / f"{self.id}.index.jsonl.gz"

    def _summary_path(self) -> Path | None:
        if not self.cache_dir:
            return None
        return Path(self.cache_dir) / f"{self.id}.summary.json"

    def read_summary(self) -> dict[str, Any] | None:
        path = self._summary_path()
        if not path:
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                summary = json.load(f)
        except (OSError, ValueError):
            return None
        if summary.get("format") != CACHE_FORMAT or summary.get("root") != self.root:
            return None
        return summary

    def read_cache(self) -> tuple[dict[str, Any], dict[str, Entry]] | None:
        """Load cached per-dir records. Returns None when missing, stale-format or for another root."""
        path = self._cache_path()
        if not path or not path.exists():
            return None
        entries: dict[str, Entry] = {}
        try:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                header = json.loads(f.readline() or "{}")
                if header.get("format") != CACHE_FORMAT or header.get("root") != self.root:
                    logger.info("Ignoring index cache for %s (format/root mismatch)", self.id)
                    return None
                for line in f:
                    name, sig, reason, row = json.loads(line)
                    entries[name] = (tuple(sig), _item_from_row(row) if row is not None else None, reason)
        except (OSError, ValueError, TypeError, EOFError) as exc:
            logger.warning("Ignoring unreadable index cache for %s: %s", self.id, exc)
            return None
        return header, entries

    def write_cache(self, entries: dict[str, Entry], complete: bool, source_revision: str = "",
                    header_lines: tuple[bytes, bytes] = (b"", b""), item_count: int = 0) -> None:
        path = self._cache_path()
        if not path:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.name + f".{os.getpid()}.{threading.get_ident()}.tmp")
            header = {
                "format": CACHE_FORMAT,
                "root": self.root,
                "complete": complete,
                "savedAt": int(time.time() * 1000),
                "sourceRevision": source_revision,
                "headerLines": [line.decode("utf-8", "surrogatepass") for line in header_lines],
                "entries": len(entries),
                "items": item_count,
            }
            with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=3) as f:
                f.write(json.dumps(header, ensure_ascii=False) + "\n")
                for name, (sig, item, reason) in list(entries.items()):
                    row = _item_to_row(item) if item is not None else None
                    f.write(json.dumps([name, list(sig), reason, row], ensure_ascii=False, separators=(",", ":")))
                    f.write("\n")
            os.replace(tmp, path)
            summary_path = self._summary_path()
            if summary_path:
                summary_tmp = summary_path.with_name(summary_path.name + ".tmp")
                summary_tmp.write_text(json.dumps({
                    "format": CACHE_FORMAT, "root": self.root, "items": item_count,
                    "complete": complete, "savedAt": header["savedAt"],
                }), encoding="utf-8")
                os.replace(summary_tmp, summary_path)
        except OSError as exc:
            logger.warning("Could not write index cache for %s: %s", self.id, exc)

    # ---------- loading ----------
    def _check_cancel(self) -> None:
        if self.cancel_event.is_set():
            raise LibraryLoadCancelled(self.id)

    def _scan(self, previous: dict[str, Entry], cold: bool) -> tuple[dict[str, Entry], tuple[bytes, bytes], str, int]:
        """Stat every ``.info`` dir; re-parse only those whose stats differ from ``previous``."""
        root = self.root
        images_dir = os.path.join(root, "images")
        vault_root = Path(root).resolve()
        header_lines = (
            _stat_line("library", os.path.join(root, "metadata.json")),
            _stat_line("images", images_dir),
        )
        digest = hashlib.sha256()
        digest.update(header_lines[0])
        digest.update(header_lines[1])
        entries: dict[str, Entry] = {}
        names = _list_info_dirs(images_dir) if os.path.isdir(images_dir) else []
        total = len(names)
        self.progress = {"done": 0, "total": total}
        parsed = 0
        last_checkpoint = time.monotonic()
        for index, name in enumerate(names):
            if index % 256 == 0:
                self._check_cancel()
                self.progress = {"done": index, "total": total}
            info_dir = os.path.join(images_dir, name)
            msig = _stat_sig(os.path.join(info_dir, "metadata.json"))
            digest.update(_meta_line(name, msig))
            dsig = _stat_sig(info_dir)
            if dsig is None:
                continue
            sig = (dsig[0], msig[0], msig[1]) if msig else (dsig[0], -1, -1)
            prev = previous.get(name)
            if prev is not None and prev[0] == sig:
                entries[name] = prev
                continue
            item, reason = _parse_info_dir(info_dir, vault_root)
            entries[name] = (sig, item, reason)
            parsed += 1
            if cold and time.monotonic() - last_checkpoint > CHECKPOINT_INTERVAL_S:
                # Resumable checkpoint: a later load reuses these records even if this one is cancelled.
                merged = dict(previous)
                merged.update(entries)
                self.write_cache(merged, complete=False)
                last_checkpoint = time.monotonic()
        self.progress = {"done": total, "total": total}
        return entries, header_lines, digest.hexdigest()[:24], parsed

    def _build(self, entries: dict[str, Entry], header_lines: tuple[bytes, bytes], deep_revision: str,
               started: float, parsed: int, source: str) -> IndexData:
        lib = _load_library_metadata(self.root)
        folders_data = _normalize_folders_data(lib)
        locked_folder_ids = _collect_locked_folder_ids(folders_data)
        folder_tree = _build_folder_tree(folders_data, locked_folder_ids)
        folder_by_id: dict = {}
        _collect_folder_by_id(folder_tree, folder_by_id)
        stats = {
            "info_dirs": len(entries),
            "loaded_items": 0,
            "skipped_missing_metadata": 0,
            "skipped_bad_metadata": 0,
            "skipped_deleted": 0,
            "skipped_locked_items": 0,
            "skipped_missing_file": 0,
        }
        by_id: dict[str, ItemInfo] = {}
        by_folder: dict[str, list[ItemInfo]] = {}
        for _sig, item, reason in entries.values():
            if item is None:
                key = _SKIP_STAT_KEYS.get(reason)
                if key:
                    stats[key] += 1
                continue
            if any(folder_id in locked_folder_ids for folder_id in item.folders):
                stats["skipped_locked_items"] += 1
                continue
            by_id[item.id] = item
            stats["loaded_items"] += 1
            for fid in item.folders:
                by_folder.setdefault(fid, []).append(item)
        by_tag, tag_summary = _build_tag_index(by_id)
        folder_counts = _compute_folder_counts(folder_tree, by_folder)
        elapsed_ms = int((time.time() - started) * 1000)
        cache_stats = {
            "folders": len(folder_by_id),
            "items": len(by_id),
            "tags": len(by_tag),
            "lockedFolders": len(locked_folder_ids),
        }
        logger.info(
            "Library %s loaded (%s): %d folders, %d items, %d tags, %d re-parsed in %dms",
            self.id, source, len(folder_by_id), len(by_id), len(by_tag), parsed, elapsed_ms,
        )
        return IndexData(
            root=self.root,
            folder_tree=folder_tree,
            folder_by_id=folder_by_id,
            items_by_id=by_id,
            items_by_folder=by_folder,
            items_by_tag=by_tag,
            tag_summary=tag_summary,
            folder_counts=folder_counts,
            locked_folder_ids=locked_folder_ids,
            entries=entries,
            header_lines=header_lines,
            stats={
                **cache_stats,
                **stats,
                "loadDurationMs": elapsed_ms,
                "loadedAt": int(time.time() * 1000),
                "vaultRoot": self.root,
                "library": self.id,
                "reparsedDirs": parsed,
                "loadSource": source,
                "sourceRevision": deep_revision,
                "sourceShallowRevision": _shallow_from_header(header_lines),
            },
        )

    def load(self, allow_stale: bool = False) -> IndexData:
        """(Re)index the library. Reuses the in-memory or on-disk records for unchanged dirs.

        With ``allow_stale`` and a complete on-disk cache, the cached snapshot is published
        first (fast restart) and the stat pass runs afterwards to pick up changes.
        """
        with self.load_lock:
            self.cancel_event.clear()
            if self.data is None:
                self.state = "loading"
            self.error = ""
            started = time.time()
            try:
                previous: dict[str, Entry] = self.data.entries if self.data is not None else {}
                cold = False
                if not previous:
                    cached = self.read_cache()
                    if cached is not None:
                        header, previous = cached
                        if allow_stale and header.get("complete"):
                            lines = tuple(line.encode("utf-8", "surrogatepass") for line in header.get("headerLines") or ["", ""])
                            stale = self._build(previous, lines, str(header.get("sourceRevision") or ""),
                                                started, 0, "cache")
                            self._check_cancel()
                            self._install(stale)
                            self.verifying = True
                            started = time.time()
                    else:
                        cold = True
                entries, header_lines, deep_revision, parsed = self._scan(previous, cold)
                self._check_cancel()
                changed = parsed > 0 or len(entries) != len(previous) or not previous
                data = self._build(entries, header_lines, deep_revision, started, parsed,
                                   "scan" if cold else "incremental")
                self._check_cancel()
                self._install(data)
                if changed or cold:
                    self.write_cache(entries, complete=True, source_revision=deep_revision,
                                     header_lines=header_lines, item_count=len(data.items_by_id))
                return data
            except LibraryLoadCancelled:
                logger.info("Library %s load cancelled", self.id)
                raise
            except Exception as exc:
                if self.data is None:
                    self.state = "error"
                self.failed_at = time.monotonic()
                self.error = str(exc) or exc.__class__.__name__
                raise
            finally:
                self.verifying = False
                self.progress = None

    def _install(self, data: IndexData) -> None:
        self.data = data
        self.state = "ready"
        self._deep_status = (0.0, "")

    def ensure_loaded(self) -> IndexData:
        data = self.data
        if data is not None:
            return data
        self.load()
        return self.data  # type: ignore[return-value]

    def unload(self) -> None:
        self.cancel_event.set()
        self.data = None
        self.state = "unloaded"
        self.verifying = False

    def item_count_hint(self) -> int | None:
        if self.data is not None:
            return len(self.data.items_by_id)
        summary = self.read_summary()
        return int(summary["items"]) if summary and summary.get("complete") else None

    # ---------- status ----------
    def status(self, deep: bool = False) -> dict[str, Any]:
        data = self.ensure_loaded()
        stats = data.stats
        mode = "deep" if deep else "shallow"
        if deep:
            observed = self._observed_deep_revision(data)
            cached_revision = str(stats.get("sourceRevision") or "")
        else:
            observed = _source_revision_for_root(self.root, deep=False)
            cached_revision = str(stats.get("sourceShallowRevision") or "")
        return {
            "ok": True,
            "changed": bool(cached_revision and observed != cached_revision),
            "mode": mode,
            "library": self.id,
            "revision": cached_revision,
            "observedRevision": observed,
            "version": APP_VERSION,
            "loadedAt": int(stats.get("loadedAt") or 0),
            "stats": {
                "folders": int(stats.get("folders") or 0),
                "items": int(stats.get("items") or 0),
                "tags": int(stats.get("tags") or 0),
            },
        }

    def _observed_deep_revision(self, data: IndexData) -> str:
        if len(data.entries) > DEEP_STATUS_LARGE_LIBRARY:
            checked_at, revision = self._deep_status
            if revision and time.time() - checked_at < DEEP_STATUS_LARGE_INTERVAL_S:
                return revision
        revision = _source_revision_for_root(self.root, deep=True)
        self._deep_status = (time.time(), revision)
        return revision

    # ---------- rating write ----------
    def _item_lock(self, item_id: str) -> threading.Lock:
        with self._write_lock:
            lock = self._item_locks.get(item_id)
            if lock is None:
                lock = self._item_locks[item_id] = threading.Lock()
            return lock

    def set_star(self, item_id: str, star: int) -> ItemInfo:
        """Write ``star`` into the item's metadata.json (atomic replace) and update the index.

        Only the ``star`` key changes; 0 removes it (Eagle stores unrated items without the key).
        Every other key, the key order and Eagle's compact JSON style are preserved.
        """
        if not self.editable:
            raise RatingWriteError(403, "このライブラリは読み取り専用のため、評価を変更できません")
        if isinstance(star, bool) or not isinstance(star, int) or not 0 <= star <= 5:
            raise RatingWriteError(422, "評価は 0〜5 で指定してください")
        data = self.ensure_loaded()
        item = data.items_by_id.get(item_id)
        if item is None:
            raise RatingWriteError(404, "素材が見つかりません")
        name = self._info_dir_name(data, item)
        if name is None:
            raise RatingWriteError(404, "素材のフォルダが見つかりません")
        info_dir = os.path.join(self.root, "images", name)
        meta_path = os.path.join(info_dir, "metadata.json")
        with self._item_lock(item_id):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except (OSError, ValueError) as exc:
                raise RatingWriteError(500, "metadata.json を読めませんでした") from exc
            if not isinstance(meta, dict) or meta.get("id") != item_id:
                raise RatingWriteError(409, "metadata.json の内容が素材と一致しません")
            if star:
                meta["star"] = star
            else:
                meta.pop("star", None)
            payload = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
            tmp_path = os.path.join(info_dir, f".metadata.{os.getpid()}.{threading.get_ident()}.tmp")
            try:
                fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as f:
                        f.write(payload)
                        f.flush()
                        os.fsync(f.fileno())
                    try:
                        os.chmod(tmp_path, os.stat(meta_path).st_mode & 0o7777)
                    except OSError:
                        pass
                    os.replace(tmp_path, meta_path)
                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
            except OSError as exc:
                raise RatingWriteError(500, "metadata.json に書き込めませんでした") from exc
            item.star = star
            # Record the new stats so our own write is not reported as a remote change.
            entry = data.entries.get(name)
            dsig = _stat_sig(info_dir)
            msig = _stat_sig(meta_path)
            if entry is not None and dsig and msig:
                data.entries[name] = ((dsig[0], msig[0], msig[1]), entry[1], entry[2])
                data.stats["sourceRevision"] = _deep_revision_from_entries(data.header_lines, data.entries)
                self._deep_status = (0.0, "")
            data.sort_cache.clear()
            data.sort_cache_slots = 0
        self.write_cache(data.entries, complete=True, source_revision=str(data.stats.get("sourceRevision") or ""),
                         header_lines=data.header_lines, item_count=len(data.items_by_id))
        return item

    @staticmethod
    def _info_dir_name(data: IndexData, item: ItemInfo) -> str | None:
        guess = f"{item.id}.info"
        entry = data.entries.get(guess)
        if entry is not None and entry[1] is item:
            return guess
        for name, (_sig, candidate, _reason) in data.entries.items():
            if candidate is item:
                return name
        return None


def _shallow_from_header(header_lines: tuple[bytes, bytes]) -> str:
    digest = hashlib.sha256()
    digest.update(header_lines[0])
    digest.update(header_lines[1])
    return digest.hexdigest()[:24]


# ---------- selection of the active library ----------
# Holds (LibraryIndex, IndexData) pinned for the current request; None = default library.
_current: contextvars.ContextVar[tuple[LibraryIndex, IndexData] | None] = contextvars.ContextVar(
    "eagle_viewer_library", default=None
)


@contextlib.contextmanager
def use_library(index: LibraryIndex, data: IndexData | None = None):
    """Run the module-level helpers against ``index`` (pins its current snapshot)."""
    token = _current.set((index, data or index.ensure_loaded()))
    try:
        yield index
    finally:
        _current.reset(token)


def set_request_library(index: LibraryIndex, data: IndexData) -> None:
    """Pin a library for the rest of the current request context (used by the API dependency)."""
    _current.set((index, data))


def current_library() -> LibraryIndex:
    pinned = _current.get()
    if pinned is not None:
        return pinned[0]
    from app.vault.libraries import get_manager
    return get_manager().default_index()


def _data() -> IndexData:
    pinned = _current.get()
    if pinned is not None:
        return pinned[1]
    return current_library().ensure_loaded()


# ---------- backwards-compatible module API (operates on the active library) ----------
def load_vault() -> None:
    """Synchronously (re)index the active library."""
    current_library().load()


def ensure_loaded() -> None:
    _data()


def get_cache_stats() -> dict[str, Any]:
    pinned = _current.get()
    if pinned is not None:
        index = pinned[0]
        return dict((index.data or pinned[1]).stats)
    return dict(_data().stats)


def get_library_status(deep: bool = False) -> dict[str, Any]:
    """Report whether the library changed on disk since the last index load."""
    return current_library().status(deep=deep)


def _path_from_node(data: IndexData, node: FolderNode) -> str:
    """Build path string from node to root using parent chain."""
    parts: list[str] = []
    while node:
        parts.append(node.name or "(名称未設定)")
        if not node.parent:
            break
        parent = data.folder_by_id.get(str(node.parent))
        if not parent:
            break
        node = parent
    parts.reverse()
    return " / ".join(parts)


def _get_folder_path(data: IndexData, folder_id: str) -> str:
    """Return path string like 'Root / Sub / Leaf' for the folder."""
    fid = str(folder_id).strip() if folder_id is not None else ""
    if not fid:
        return ""
    cache = data.folder_path_cache
    if fid in cache:
        return cache[fid]
    node = data.folder_by_id.get(fid)
    if not node:
        try:
            if str(int(fid)) == fid:
                node = data.folder_by_id.get(int(fid))
        except (ValueError, TypeError):
            pass
    if not node:
        node = _find_node_in_tree(data.folder_tree, fid)
    if not node:
        cache[fid] = ""
        return ""
    path = _path_from_node(data, node)
    cache[fid] = path
    return path


def get_folder_path(folder_id: str) -> str:
    return _get_folder_path(_data(), folder_id)


def get_folder_paths_for_item(item: ItemInfo) -> list[str]:
    """Return list of folder path strings (root to leaf) for each folder this item belongs to."""
    data = _data()
    paths: list[str] = []
    for fid in item.folders or []:
        p = _get_folder_path(data, fid)
        if p and p not in paths:
            paths.append(p)
    return paths


def get_subfolders(folder_id: str) -> list[dict]:
    """Return direct children of the folder: [{id, name}, ...]."""
    data = _data()
    fid = str(folder_id) if folder_id is not None else ""
    node = data.folder_by_id.get(fid)
    if not node or node.locked:
        return []
    return [_with_cover({"id": c.id, "name": c.name or "(名称未設定)", "locked": c.locked}, c, data) for c in node.children]


def _with_cover(d: dict, node: FolderNode, data: "IndexData") -> dict:
    """Add the Eagle folder cover when it points at an item the Viewer can serve."""
    if not node.locked and node.cover_id and node.cover_id in data.items_by_id:
        d["coverId"] = node.cover_id
    return d


def get_folder_tree() -> list[FolderNode]:
    return _data().folder_tree


def get_item(item_id: str) -> ItemInfo | None:
    return _data().items_by_id.get(item_id)


def get_items_in_folder(folder_id: str) -> list[ItemInfo]:
    data = _data()
    fid = str(folder_id) if folder_id is not None else ""
    if fid in data.locked_folder_ids:
        return []
    return data.items_by_folder.get(fid, [])


def is_folder_locked(folder_id: str) -> bool:
    return str(folder_id) in _data().locked_folder_ids


def get_all_items() -> list[ItemInfo]:
    """Return all items (flat list, no folder structure)."""
    return list(_data().items_by_id.values())


def get_all_tags() -> list[dict]:
    """Return all tags with counts: [{name, count}, ...] sorted by count desc."""
    return list(_data().tag_summary)


def get_items_by_tag(tag: str) -> list[ItemInfo]:
    """Return items that have the given tag (case-sensitive match)."""
    if not tag:
        return []
    return list(_data().items_by_tag.get(tag, []))


def search_items(q: str) -> list[ItemInfo]:
    """Search by keyword in name, tags, annotation, or file extension (case-insensitive)."""
    if not q or not q.strip():
        return []
    key = q.strip().lower().lstrip(".")
    out: list[ItemInfo] = []
    for item in _data().items_by_id.values():
        if key in (item.name or "").lower():
            out.append(item)
        elif any(key in (t or "").lower() for t in item.tags):
            out.append(item)
        elif key in (item.annotation or "").lower():
            out.append(item)
        elif item.ext and key == (item.ext or "").lower():
            # Match file extension: "pdf", ".pdf" -> ext "pdf"
            out.append(item)
    return out


def _item_type(ext: str) -> str:
    e = (ext or "").strip().lower().lstrip(".")
    if e in IMAGE_EXTS:
        return "image"
    if e in VIDEO_EXTS:
        return "video"
    if e in AUDIO_EXTS:
        return "audio"
    if e in DOCUMENT_EXTS:
        return "document"
    return "other"


def filter_items_by_type(items: list[ItemInfo], type_filter: str) -> list[ItemInfo]:
    """Filter items by type: all, image, video, document, audio, other."""
    if not type_filter or type_filter.lower() == "all":
        return items
    t = type_filter.lower().strip()
    if t not in VALID_TYPE_FILTERS:
        return items
    return [it for it in items if _item_type(it.ext) == t]


def filter_items_by_rating(items: list[ItemInfo], rating: str) -> list[ItemInfo]:
    """Filter by rating: all, unrated (no star), or "N" = at least N stars."""
    r = (rating or "all").strip().lower()
    if r == "all" or r not in VALID_RATING_FILTERS:
        return items
    if r == "unrated":
        return [it for it in items if not it.star]
    minimum = int(r)
    return [it for it in items if it.star >= minimum]


def sort_items(
    items: list[ItemInfo],
    order_by: str = "mtime",
    order_dir: str = "desc",
) -> list[ItemInfo]:
    """Sort items by mtime, btime, name, size, ext or star. dir: asc | desc.

    ``star`` orders rated items by rating (desc = high to low) and always puts unrated
    items last; ties keep the default order (modified time, newest first).
    """
    if not items:
        return []
    ob = order_by.lower() if order_by else "mtime"
    od = (order_dir or "desc").lower()
    if ob not in VALID_SORT_FIELDS:
        ob = "mtime"
    if od not in VALID_SORT_DIR:
        od = "desc"
    reverse = od == "desc"

    data = _data()
    cache_key = (tuple(str(item.id) for item in items), ob, od)
    cached = data.sort_cache.get(cache_key)
    if cached is not None:
        return list(cached)

    if ob == "star":
        by_default = sorted(items, key=lambda it: it.mtime or 0, reverse=True)
        if reverse:
            ordered = sorted(by_default, key=lambda it: (it.star == 0, -it.star))
        else:
            ordered = sorted(by_default, key=lambda it: (it.star == 0, it.star))
    else:
        key_fn = {
            "mtime": lambda it: it.mtime or 0,
            "btime": lambda it: it.btime or 0,
            "name": lambda it: (it.name or "").lower(),
            "size": lambda it: it.size or 0,
            "ext": lambda it: (it.ext or "").lower(),
        }[ob]
        ordered = sorted(items, key=key_fn, reverse=reverse)

    # Bound the cache by total slots, not entry count: one 100k-item ordering is large.
    slots = len(ordered) * 2
    if slots <= SORT_CACHE_MAX_SLOTS:
        while data.sort_cache and (data.sort_cache_slots + slots > SORT_CACHE_MAX_SLOTS or len(data.sort_cache) >= 128):
            old_key = next(iter(data.sort_cache))
            data.sort_cache_slots -= len(data.sort_cache.pop(old_key)) * 2
        data.sort_cache[cache_key] = ordered
        data.sort_cache_slots += slots
    return list(ordered)


def get_recent_items(days: int = 7) -> list[ItemInfo]:
    """Items added or modified in the last N days (by mtime, ms)."""
    if days <= 0:
        return []
    now_ms = int(time.time() * 1000)
    cutoff = now_ms - days * 24 * 60 * 60 * 1000
    return [it for it in _data().items_by_id.values() if (it.mtime or 0) >= cutoff]


def set_item_star(item_id: str, star: int) -> ItemInfo:
    """Write a rating for an item of the active library (see ``LibraryIndex.set_star``)."""
    return current_library().set_star(item_id, star)


def folder_tree_to_dict(nodes: list[FolderNode]) -> list[dict]:
    return _folder_tree_to_dict(nodes, _data())


def _folder_tree_to_dict(nodes: list[FolderNode], data: "IndexData") -> list[dict]:
    return [
        _with_cover({
            "id": n.id,
            "name": n.name,
            "description": n.description or "",
            "children": [] if n.locked else _folder_tree_to_dict(n.children, data),
            "count": 0 if n.locked else data.folder_counts.get(n.id, 0),
            "locked": n.locked,
        }, n, data)
        for n in nodes
    ]


def item_to_dict(item: ItemInfo, include_folder_paths: bool = False) -> dict:
    d = {
        "id": item.id,
        "name": item.name,
        "ext": item.ext,
        "folders": item.folders or [],
        "width": item.width,
        "height": item.height,
        "size": item.size,
        "tags": item.tags or [],
        "url": item.url or "",
        "sourceDomain": _normalize_source_domain(item.url),
        "annotation": item.annotation or "",
        "duration": item.duration or 0,
        "bpm": item.bpm or 0,
        "btime": item.btime,
        "mtime": item.mtime,
        "star": item.star or 0,
        "hasThumbnail": bool(item.thumbnail_path),
    }
    if include_folder_paths:
        d["folderPaths"] = get_folder_paths_for_item(item)
    return d


def item_to_list_dict(item: ItemInfo, include_folder_paths: bool = False) -> dict:
    """Return the collection payload without the potentially large note field."""
    result = {
        "id": item.id,
        "name": item.name,
        "ext": item.ext,
        "folders": item.folders or [],
        "width": item.width,
        "height": item.height,
        "size": item.size,
        "tags": item.tags or [],
        "url": item.url or "",
        "sourceDomain": _normalize_source_domain(item.url),
        "duration": item.duration or 0,
        "bpm": item.bpm or 0,
        "btime": item.btime,
        "mtime": item.mtime,
        "star": item.star or 0,
        "hasThumbnail": bool(item.thumbnail_path),
    }
    if include_folder_paths:
        result["folderPaths"] = get_folder_paths_for_item(item)
    return result
