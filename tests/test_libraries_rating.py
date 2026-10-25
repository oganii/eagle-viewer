import gzip
import importlib
import json
import os
import shutil
import time
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from tests.conftest import FIXTURES, reload_app_modules


def _copy_library(src_name: str, dest: Path) -> Path:
    shutil.copytree(FIXTURES / src_name, dest)
    return dest


@pytest.fixture()
def multi_library(monkeypatch, tmp_path):
    """Two writable temp copies of the fixtures: Sample (default) and Second."""
    sample = _copy_library("sample.library", tmp_path / "libs" / "Sample.library")
    second = _copy_library("Second.library", tmp_path / "libs" / "Second.library")
    monkeypatch.setenv("EAGLE_VAULT_ROOT", str(sample))
    monkeypatch.setenv("EAGLE_VAULT_LIBRARIES", f"{sample}\n{second}")
    monkeypatch.setenv("EAGLE_VAULT_EDITABLE", "second")
    monkeypatch.setenv("EAGLE_INDEX_CACHE_DIR", str(tmp_path / "cache"))
    reload_app_modules()
    import app.main

    importlib.reload(app.main)
    from app.vault.libraries import get_manager

    return {"sample": sample, "second": second, "cache": tmp_path / "cache", "manager": get_manager(),
            "client": TestClient(app.main.app)}


def _wait_ready(client, lib, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        libs = {entry["id"]: entry for entry in client.get("/api/libraries").json()["libraries"]}
        if libs[lib]["state"] == "ready":
            return libs[lib]
        time.sleep(0.02)
    raise AssertionError(f"library {lib} did not become ready")


# ---------- configuration ----------

def test_library_specs_parse_paths_globs_and_default(tmp_path):
    from app.vault.libraries import parse_library_specs

    for name in ("Doujin_CGs_Manga.library", "Home.library", "notes"):
        (tmp_path / name).mkdir()
    raw = f"{tmp_path}/*.library\n/other/ComfyUI.library:/other/Home.library"
    specs, default_id = parse_library_specs(raw, "/other/ComfyUI.library")

    assert [(s.id, s.name) for s in specs] == [
        ("doujin-cgs-manga", "Doujin_CGs_Manga"),
        ("home", "Home"),
        ("comfyui", "ComfyUI"),
        ("home-2", "Home"),
    ]
    assert default_id == "comfyui"

    single, single_default = parse_library_specs("", "/vault")
    assert [(s.id, s.root) for s in single] == [("vault", "/vault")]
    assert single_default == "vault"

    named, named_default = parse_library_specs("/a/One.library:/a/Two.library", "", "Two")
    assert [s.id for s in named] == ["one", "two"] and named_default == "two"


# ---------- library listing and per-library items ----------

def test_libraries_endpoint_lists_lazy_state_and_editable_flag(multi_library):
    client = multi_library["client"]
    listing = client.get("/api/libraries").json()

    assert listing["default"] == "sample"
    assert listing["maxLoaded"] == 2
    assert [(lib["id"], lib["name"], lib["state"], lib["editable"]) for lib in listing["libraries"]] == [
        ("sample", "Sample", "unloaded", False),
        ("second", "Second", "unloaded", True),
    ]
    assert client.get("/api/items?lib=nope").status_code == 404


def test_items_are_scoped_per_library_and_load_lazily(multi_library):
    client = multi_library["client"]

    first = client.get("/api/items", params={"lib": "second"})
    assert first.status_code == 503
    assert first.json()["detail"]["code"] == "library-loading"
    assert first.headers["retry-after"] == "2"
    ready = _wait_ready(client, "second")
    assert ready["items"] == 3

    second_items = client.get("/api/items", params={"lib": "second"}).json()
    assert second_items["total"] == 3
    assert client.get("/api/items/item-one", params={"lib": "second"}).json()["name"] == "Second library twin"
    assert client.get("/api/tree", params={"lib": "second"}).json()["folders"][0]["name"] == "二番目"

    # The default library was never requested, so it is still unloaded.
    states = {lib["id"]: lib["state"] for lib in client.get("/api/libraries").json()["libraries"]}
    assert states["sample"] == "unloaded"
    assert client.get("/api/items").status_code == 503
    _wait_ready(client, "sample")
    assert client.get("/api/items").json()["total"] == 18
    assert client.get("/api/items/item-one").json()["name"] == "Alpha landscape"
    thumb = client.get("/api/items/second-b/thumbnail", params={"lib": "second"})
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/png"
    assert client.get("/api/items/second-b/thumbnail").status_code == 404


# ---------- rating parse / filter / sort ----------

def test_rating_is_parsed_and_exposed(sample_library):
    import app.api.folders as folders_api
    import app.api.items as items_api

    assert items_api.api_item_detail("item-one")["star"] == 5
    assert items_api.api_item_detail("item-three")["star"] == 0
    listed = {item["id"]: item["star"] for item in folders_api.api_all_items(limit=500)["items"]}
    assert listed["item-two"] == 3 and listed["item-wide"] == 1 and listed["item-pdf"] == 0


def test_rating_filter_minimum_and_unrated(sample_library):
    import app.api.folders as folders_api

    def ids(**kwargs):
        return {item["id"] for item in folders_api.api_all_items(limit=500, **kwargs)["items"]}

    assert ids(rating="5") == {"item-one"}
    assert ids(rating="3") == {"item-one", "item-two", "item-jpg"}
    assert ids(rating="1") == {"item-one", "item-two", "item-jpg", "item-wide"}
    assert len(ids(rating="unrated")) == 14
    assert len(ids(rating="bogus")) == 18
    assert folders_api.api_search("Alpha", rating="unrated")["total"] == 0
    assert folders_api.api_folder_items("root", rating="1")["total"] >= 1


def test_rating_sort_puts_unrated_last_and_breaks_ties_by_modified_time(sample_library):
    import app.api.folders as folders_api
    from app.vault import get_item

    desc = [item["id"] for item in folders_api.api_all_items(sort="star", dir="desc", limit=500)["items"]]
    tie = sorted(["item-two", "item-jpg"], key=lambda item_id: get_item(item_id).mtime, reverse=True)
    assert desc[:4] == ["item-one", *tie, "item-wide"]
    unrated_default = [item["id"] for item in folders_api.api_all_items(rating="unrated", limit=500)["items"]]
    assert desc[4:] == unrated_default

    asc = [item["id"] for item in folders_api.api_all_items(sort="star", dir="asc", limit=500)["items"]]
    assert asc[:4] == ["item-wide", *tie, "item-one"]
    assert asc[4:] == unrated_default


# ---------- index cache ----------

def _new_index(root, cache_dir, lib_id="lib", editable=False):
    from app.vault.parser import LibraryIndex

    return LibraryIndex(str(root), lib_id=lib_id, cache_dir=str(cache_dir), editable=editable)


def test_index_cache_round_trip_and_incremental_invalidation(tmp_path):
    root = _copy_library("sample.library", tmp_path / "Sample.library")
    cache = tmp_path / "cache"

    cold = _new_index(root, cache).load()
    assert cold.stats["loadSource"] == "scan"
    assert cold.stats["reparsedDirs"] == 19
    cache_file = cache / "lib.index.jsonl.gz"
    with gzip.open(cache_file, "rt", encoding="utf-8") as f:
        header = json.loads(f.readline())
    assert header["complete"] is True and header["root"] == str(root) and header["items"] == 18

    warm_index = _new_index(root, cache)
    warm = warm_index.load()
    assert warm.stats["loadSource"] == "incremental"
    assert warm.stats["reparsedDirs"] == 0
    assert warm.stats["sourceRevision"] == cold.stats["sourceRevision"]
    assert {k: (v.name, v.star, v.tags, v.main_file_path) for k, v in warm.items_by_id.items()} == {
        k: (v.name, v.star, v.tags, v.main_file_path) for k, v in cold.items_by_id.items()
    }
    assert warm_index.status(deep=True)["changed"] is False
    assert warm_index.item_count_hint() == 18

    # Edit one item on disk: only that dir is re-read.
    meta_path = root / "images" / "item-three.info" / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["star"] = 2
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    later = time.time() + 5
    os.utime(meta_path, (later, later))
    os.utime(meta_path.parent, (later, later))
    assert warm_index.status(deep=True)["changed"] is True
    changed = _new_index(root, cache).load()
    assert changed.stats["reparsedDirs"] == 1
    assert changed.items_by_id["item-three"].star == 2

    # A cache written for another root or format is ignored.
    other = _new_index(tmp_path / "Elsewhere.library", cache)
    assert other.read_cache() is None
    with gzip.open(cache_file, "rt", encoding="utf-8") as f:
        lines = f.read().splitlines()
    stale_header = json.loads(lines[0])
    stale_header["format"] = -1
    with gzip.open(cache_file, "wt", encoding="utf-8") as f:
        f.write("\n".join([json.dumps(stale_header), *lines[1:]]) + "\n")
    assert _new_index(root, cache).read_cache() is None


def test_stale_cache_is_served_first_then_verified(tmp_path):
    root = _copy_library("sample.library", tmp_path / "Sample.library")
    cache = tmp_path / "cache"
    _new_index(root, cache).load()

    index = _new_index(root, cache)
    published = []
    original_install = index._install

    def spy(data):
        published.append(data.stats["loadSource"])
        original_install(data)

    index._install = spy
    index.load(allow_stale=True)
    assert published == ["cache", "incremental"]
    assert index.state == "ready" and index.verifying is False


def test_cancelled_cold_load_keeps_no_partial_index(tmp_path):
    from app.vault.parser import LibraryLoadCancelled

    root = _copy_library("sample.library", tmp_path / "Sample.library")
    index = _new_index(root, tmp_path / "cache")
    index.cancel_event.set()
    original_scan = index._scan

    def cancelled_scan(previous, cold):
        index.cancel_event.set()
        return original_scan(previous, cold)

    index._scan = cancelled_scan
    with pytest.raises(LibraryLoadCancelled):
        index.load()
    assert index.data is None


# ---------- LRU eviction ----------

def test_lru_evicts_least_recently_used_non_default_library(tmp_path):
    from app.vault.libraries import LibraryManager, parse_library_specs

    roots = [
        _copy_library("sample.library", tmp_path / "Default.library"),
        _copy_library("Second.library", tmp_path / "Second.library"),
        _copy_library("Second.library", tmp_path / "Third.library"),
    ]
    specs, default_id = parse_library_specs("\n".join(map(str, roots)), str(roots[0]))
    manager = LibraryManager(specs, default_id, cache_dir=str(tmp_path / "cache"), max_loaded=2)
    default, second, third = (manager.indexes[i] for i in ("default", "second", "third"))

    manager.load_now(default)
    manager.load_now(second)
    assert default.data is not None and second.data is not None

    manager.load_now(third)
    assert second.data is None and second.state == "unloaded"
    assert default.data is not None and third.data is not None

    # Background loading applies the same cap and never evicts the default library.
    manager.touch(default)
    manager.request_load(second)
    manager.wait(second, timeout=10)
    assert second.state == "ready"
    assert third.data is None
    assert default.data is not None
    # Evicted libraries still report their cached item count.
    assert manager.describe(third)["items"] == 3


# ---------- rating edits ----------

def test_rating_write_keeps_eagle_json_style_and_updates_index(multi_library):
    client = multi_library["client"]
    client.get("/api/items", params={"lib": "second"})
    _wait_ready(client, "second")
    meta_b = multi_library["second"] / "images" / "second-b.info" / "metadata.json"
    meta_c = multi_library["second"] / "images" / "second-c.info" / "metadata.json"
    original_b = meta_b.read_text(encoding="utf-8")
    original_c = meta_c.read_text(encoding="utf-8")

    response = client.put("/api/items/second-c/star", params={"lib": "second"}, json={"star": 2})
    assert response.status_code == 200 and response.json()["star"] == 2
    assert meta_c.read_text(encoding="utf-8") == original_c[:-1] + ',"star":2}'

    cleared = client.put("/api/items/second-b/star", params={"lib": "second"}, json={"star": 0})
    assert cleared.status_code == 200 and cleared.json()["star"] == 0
    assert meta_b.read_text(encoding="utf-8") == original_b.replace('"star":4,', "")
    assert not [p for p in meta_b.parent.iterdir() if p.name.endswith(".tmp")]

    rated = client.get("/api/items", params={"lib": "second", "rating": "1"}).json()
    assert [item["id"] for item in rated["items"]] == ["second-c"]
    # Our own write is not reported as a remote change.
    assert client.get("/api/library/status", params={"lib": "second", "deep": "true"}).json()["changed"] is False

    # The persisted cache already has the new values (no re-parse needed after restart).
    from app.vault.parser import LibraryIndex

    restarted = LibraryIndex(str(multi_library["second"]), lib_id="second", cache_dir=str(multi_library["cache"]))
    data = restarted.load()
    assert data.stats["reparsedDirs"] == 0
    assert data.items_by_id["second-c"].star == 2 and data.items_by_id["second-b"].star == 0


def test_rating_write_rejections(multi_library):
    client = multi_library["client"]
    client.get("/api/items")
    client.get("/api/items", params={"lib": "second"})
    _wait_ready(client, "sample")
    _wait_ready(client, "second")
    sample_meta = multi_library["sample"] / "images" / "item-one.info" / "metadata.json"
    before = sample_meta.read_bytes()

    readonly = client.put("/api/items/item-one/star", json={"star": 1})
    assert readonly.status_code == 403
    assert "読み取り専用" in readonly.json()["detail"]
    assert sample_meta.read_bytes() == before

    out_of_range = client.put("/api/items/second-c/star", params={"lib": "second"}, json={"star": 6})
    assert out_of_range.status_code == 422
    assert client.put("/api/items/second-c/star", params={"lib": "second"}, json={"star": -1}).status_code == 422
    assert client.put("/api/items/missing/star", params={"lib": "second"}, json={"star": 3}).status_code == 404
