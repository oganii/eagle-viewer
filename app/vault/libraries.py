"""Registry of the Eagle libraries this viewer can switch between.

Libraries are configured with ``EAGLE_VAULT_LIBRARIES`` (see app/config.py). Only the
default library is indexed at startup; the others are indexed lazily in a background
thread on first use. At most ``EAGLE_VAULT_MAX_LOADED`` libraries stay in memory; the
least recently used non-default library is evicted (and its in-flight load cancelled)
when another one is needed.
"""
import glob
import hashlib
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app import config
from app.vault.parser import LibraryIndex, LibraryLoadCancelled

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LibrarySpec:
    id: str
    name: str
    root: str


def library_display_name(root: str) -> str:
    name = Path(root.rstrip("/")).name
    return name[: -len(".library")] if name.endswith(".library") else name


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "lib-" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:8]


def _split_list(raw: str) -> list[str]:
    parts: list[str] = []
    for line in (raw or "").replace("\r", "\n").split("\n"):
        for part in line.split(":"):
            part = part.strip()
            if part:
                parts.append(part)
    return parts


def parse_library_specs(raw: str, default_root: str, default_name: str = "") -> tuple[list[LibrarySpec], str]:
    """Return (specs, default_id) from the env values. Paths are de-duplicated by normalized path."""
    paths: list[str] = []
    for part in _split_list(raw):
        expanded = os.path.expanduser(part)
        if any(ch in expanded for ch in "*?["):
            paths.extend(sorted(p for p in glob.glob(expanded) if os.path.isdir(p)))
        else:
            paths.append(expanded)
    default_root = os.path.expanduser(default_root) if default_root else ""
    normalized_default = os.path.normpath(default_root) if default_root else ""
    if default_root and normalized_default not in {os.path.normpath(p) for p in paths}:
        if not default_name or not paths:
            paths.insert(0, default_root)
    specs: list[LibrarySpec] = []
    seen_paths: set[str] = set()
    used_ids: set[str] = set()
    for path in paths:
        norm = os.path.normpath(path)
        if norm in seen_paths:
            continue
        seen_paths.add(norm)
        name = library_display_name(norm)
        base = slugify(name)
        lib_id = base
        counter = 2
        while lib_id in used_ids:
            lib_id = f"{base}-{counter}"
            counter += 1
        used_ids.add(lib_id)
        specs.append(LibrarySpec(id=lib_id, name=name, root=norm))
    default_id = specs[0].id if specs else ""
    wanted = (default_name or "").strip()
    for spec in specs:
        if wanted and wanted.lower() in {spec.id, spec.name.lower(), spec.root.lower()}:
            default_id = spec.id
            break
        if not wanted and normalized_default and spec.root == normalized_default:
            default_id = spec.id
            break
    return specs, default_id


def _editable_ids(raw: str, specs: list[LibrarySpec]) -> set[str]:
    wanted = {part.strip().lower() for part in re.split(r"[\n,]", (raw or "").replace(":", "\n")) if part.strip()}
    out: set[str] = set()
    for spec in specs:
        keys = {spec.id, spec.name.lower(), spec.root.lower(), os.path.normpath(spec.root).lower()}
        if keys & wanted:
            out.add(spec.id)
    return out


class LibraryManager:
    def __init__(self, specs: list[LibrarySpec], default_id: str, cache_dir: str = "",
                 max_loaded: int = 2, editable: set[str] | None = None):
        if not specs:
            raise ValueError("No Eagle library configured")
        editable = editable or set()
        self.specs = {spec.id: spec for spec in specs}
        self.default_id = default_id if default_id in self.specs else specs[0].id
        self.max_loaded = max(1, int(max_loaded))
        self.indexes: dict[str, LibraryIndex] = {
            spec.id: LibraryIndex(spec.root, lib_id=spec.id, name=spec.name, cache_dir=cache_dir,
                                  editable=spec.id in editable)
            for spec in specs
        }
        self._lock = threading.RLock()
        self._threads: dict[str, threading.Thread] = {}

    # ---------- lookup ----------
    def default_index(self) -> LibraryIndex:
        return self.indexes[self.default_id]

    def resolve(self, lib: str | None) -> LibraryIndex | None:
        key = (lib or "").strip()
        if not key:
            return self.default_index()
        if key in self.indexes:
            return self.indexes[key]
        lowered = key.lower()
        for index in self.indexes.values():
            if index.name.lower() == lowered:
                return index
        return None

    def touch(self, index: LibraryIndex) -> None:
        index.last_used = time.monotonic()

    # ---------- memory cap ----------
    def _resident(self) -> list[LibraryIndex]:
        return [idx for idx in self.indexes.values() if idx.data is not None or idx.state == "loading"]

    def _make_room_for(self, incoming: LibraryIndex) -> None:
        with self._lock:
            resident = [idx for idx in self._resident() if idx is not incoming]
            while len(resident) + 1 > self.max_loaded:
                candidates = [idx for idx in resident if idx.id != self.default_id]
                if not candidates:
                    break
                victim = min(candidates, key=lambda idx: idx.last_used)
                logger.info("Evicting library %s from memory (LRU, max %d)", victim.id, self.max_loaded)
                victim.unload()
                resident.remove(victim)

    # ---------- loading ----------
    def request_load(self, index: LibraryIndex) -> None:
        """Start indexing ``index`` in the background unless it is ready or already loading."""
        with self._lock:
            self.touch(index)
            if index.data is not None and index.state == "ready":
                return
            thread = self._threads.get(index.id)
            if thread is not None and thread.is_alive():
                return
            self._make_room_for(index)
            index.state = "loading"
            index.cancel_event.clear()
            thread = threading.Thread(target=self._load_worker, args=(index,), name=f"eagle-index-{index.id}",
                                      daemon=True)
            self._threads[index.id] = thread
            thread.start()

    def _load_worker(self, index: LibraryIndex) -> None:
        try:
            index.load(allow_stale=True)
        except LibraryLoadCancelled:
            if index.data is None:
                index.state = "unloaded"
        except Exception:
            logger.exception("Failed to index Eagle library %s", index.id)

    def load_now(self, index: LibraryIndex) -> None:
        """Synchronously index (tests, CLI). Applies the same memory cap."""
        with self._lock:
            self.touch(index)
            self._make_room_for(index)
        index.load()

    def wait(self, index: LibraryIndex, timeout: float | None = None) -> None:
        thread = self._threads.get(index.id)
        if thread is not None:
            thread.join(timeout)

    # ---------- description ----------
    def describe(self, index: LibraryIndex) -> dict[str, Any]:
        return {
            "id": index.id,
            "name": index.name,
            "default": index.id == self.default_id,
            "state": index.state,
            "items": index.item_count_hint(),
            "progress": index.progress,
            "verifying": index.verifying,
            "editable": index.editable,
            "error": index.error or None,
        }

    def list(self) -> dict[str, Any]:
        return {
            "default": self.default_id,
            "maxLoaded": self.max_loaded,
            "libraries": [self.describe(index) for index in self.indexes.values()],
        }


_manager: LibraryManager | None = None
_manager_lock = threading.Lock()


def build_manager_from_config() -> LibraryManager:
    # Without EAGLE_VAULT_ROOT the built-in "/vault" default only applies when no list is configured.
    default_root = config.VAULT_ROOT if (config.VAULT_ROOT_IS_SET or not config.VAULT_LIBRARIES.strip()) else ""
    specs, default_id = parse_library_specs(config.VAULT_LIBRARIES, default_root, config.VAULT_DEFAULT_LIBRARY)
    return LibraryManager(
        specs,
        default_id,
        cache_dir=config.INDEX_CACHE_DIR,
        max_loaded=config.MAX_LOADED_LIBRARIES,
        editable=_editable_ids(config.VAULT_EDITABLE, specs),
    )


def get_manager() -> LibraryManager:
    global _manager
    if _manager is None:
        with _manager_lock:
            if _manager is None:
                _manager = build_manager_from_config()
    return _manager


def set_manager(manager: LibraryManager | None) -> None:
    """Replace the registry (tests)."""
    global _manager
    _manager = manager
