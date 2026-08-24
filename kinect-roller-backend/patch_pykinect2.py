"""One-time compatibility patch for the `pykinect2` PyPI package, which was
written for 32-bit Python 2.7-era comtypes and breaks on modern 64-bit
Python without these fixes. Run once after installing requirements.txt in
a fresh virtualenv:

    python patch_pykinect2.py

Idempotent - safe to run multiple times (e.g. after reinstalling
requirements). Not needed for --mock, only for the real Kinect v2 path.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def find_pykinect2_dir() -> Path:
    try:
        import pykinect2
    except ImportError:
        print("pykinect2 is not installed in this environment. "
              "Run `pip install -r requirements.txt` first.")
        sys.exit(1)
    return Path(pykinect2.__file__).parent


def patch_file(path: Path, replacements: list[tuple[str, str, str]]) -> None:
    """replacements: list of (marker_to_detect_already_patched, old, new)."""
    text = path.read_text(encoding="utf-8")
    changed = False
    for marker, old, new in replacements:
        if marker in text:
            continue  # already patched
        if old not in text:
            print(f"  ! expected snippet not found in {path.name}, skipping "
                  f"one patch (already patched differently, or package version changed)")
            continue
        text = text.replace(old, new)
        changed = True
    if changed:
        path.write_text(text, encoding="utf-8")
        print(f"  patched {path.name}")
    else:
        print(f"  {path.name} already up to date")


def main() -> None:
    pkg_dir = find_pykinect2_dir()
    print(f"Patching pykinect2 in {pkg_dir}")

    v2_path = pkg_dir / "PyKinectV2.py"
    patch_file(v2_path, [
        (
            "## Patched for 64-bit Python: tagSTATSTG",
            "assert sizeof(tagSTATSTG) == 72, sizeof(tagSTATSTG)\n"
            "assert alignment(tagSTATSTG) == 8, alignment(tagSTATSTG)",
            "## Patched for 64-bit Python: tagSTATSTG's pwcsName is a pointer-sized\n"
            "## WSTRING field, so the struct is legitimately 80 bytes (not 72) on 64-bit\n"
            "## builds. This struct is OLE storage plumbing unrelated to the Kinect\n"
            "## sensor streams, so the original 32-bit-only size/alignment checks are\n"
            "## safe to drop. See kinect-roller-backend/README.md.\n"
            "## assert sizeof(tagSTATSTG) == 72, sizeof(tagSTATSTG)\n"
            "## assert alignment(tagSTATSTG) == 8, alignment(tagSTATSTG)",
        ),
        (
            "## Patched: this generated-module version stamp",
            "from comtypes import _check_version; _check_version('')",
            "## Patched: this generated-module version stamp always mismatches modern\n"
            "## comtypes releases (it compares against comtypes' internal codegen\n"
            "## version, not anything Kinect-related), so it's disabled here. The COM\n"
            "## interfaces below are fully spelled out and don't depend on it. See\n"
            "## kinect-roller-backend/README.md.\n"
            "## from comtypes import _check_version; _check_version('')",
        ),
    ])

    runtime_path = pkg_dir / "PyKinectRuntime.py"
    text = runtime_path.read_text(encoding="utf-8")
    if "time.clock()" in text:
        text = text.replace("time.clock()", "time.perf_counter()")
        runtime_path.write_text(text, encoding="utf-8")
        print(f"  patched {runtime_path.name} (time.clock -> time.perf_counter, "
              f"removed in Python 3.8+)")
    else:
        print(f"  {runtime_path.name} already up to date")

    print("Done.")


if __name__ == "__main__":
    main()
