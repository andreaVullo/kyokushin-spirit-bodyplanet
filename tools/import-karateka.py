"""Package unchanged PNG bytes for lazy, offline-safe loading (no image editing)."""
from pathlib import Path
import argparse
import base64
import hashlib
import json

parser = argparse.ArgumentParser()
parser.add_argument("sprites", type=Path)
parser.add_argument("bounds", type=Path)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
atlas = json.loads(args.bounds.read_text())
checksums = {}
for character, sheets in atlas.items():
    folder = project / "assets" / "karateka" / character
    folder.mkdir(parents=True, exist_ok=True)
    for category, meta in sheets.items():
        data = (args.sprites / character / (category + ".png")).read_bytes()
        key = character + "/" + category
        checksums[key] = hashlib.sha256(data).hexdigest()
        url = "data:image/png;base64," + base64.b64encode(data).decode("ascii")
        (folder / (category + ".js")).write_text(
            "window.__kyokushinRegisterSprite(" + json.dumps(key) + "," + json.dumps(url) + ");\n"
        )
        # Calibrate punches using upright poses, not the crouched hooks.
        if category == "pugni":
            heights = sorted(f["opaque_bounds"][3] for f in meta["frames"][:8])
            meta["nominal_height"] = (heights[3] + heights[4]) / 2
            meta["scale_for_228px_fighter"] = 228 / meta["nominal_height"]
        for frame in meta["frames"]:
            for detail in ["original_region", "component", "opaque_pixels", "row", "col", "anchor_mode"]:
                frame.pop(detail, None)
(project / "scripts" / "karateka-atlas.js").write_text(
    "/* Measured silhouettes and floor anchors; source PNGs remain unchanged. */\n"
    "window.KyokushinSpriteAtlas = " + json.dumps(atlas, separators=(",", ":")) + ";\n"
)
(project / "assets" / "karateka" / "checksums.json").write_text(json.dumps(checksums, indent=2) + "\n")
print(f"Packaged {len(checksums)} unchanged PNGs.")
