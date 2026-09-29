import argparse
import json
import shutil
from pathlib import Path

try:
    from gradio_client import Client, handle_file
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Missing gradio_client. Install deps with: "
        "python -m pip install gradio_client pillow"
    ) from exc

try:
    from PIL import Image, ImageDraw, ImageFilter
except ModuleNotFoundError as exc:
    raise SystemExit("Missing Pillow. Install deps with: python -m pip install pillow") from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ASSET_ID = "classic-cabinet-depth-prototype"
DEFAULT_SEED = 551029
DEFAULT_PROMPT = (
    "classic upright arcade cabinet 3D game asset, black wooden cabinet, red marquee panel, "
    "glass screen, slanted control deck, joystick, colored buttons, coin door, thick cabinet body, "
    "visible side panels, clean single object, no text"
)


def draw_concept(path: Path) -> None:
    scale = 3
    image = Image.new("RGBA", (768 * scale, 768 * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def rect(bounds, fill, outline=None, width=1, radius=10):
        scaled = tuple(v * scale for v in bounds)
        draw.rounded_rectangle(
            scaled,
            radius=radius * scale,
            fill=fill,
            outline=outline,
            width=width * scale,
        )

    def poly(points, fill, outline=None, width=1):
        scaled = [(x * scale, y * scale) for x, y in points]
        draw.polygon(scaled, fill=fill, outline=outline)
        if outline and width > 1:
            draw.line(scaled + [scaled[0]], fill=outline, width=width * scale, joint="curve")

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((190 * scale, 662 * scale, 578 * scale, 730 * scale), fill=(0, 0, 0, 88))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18 * scale))
    image.alpha_composite(shadow)

    black = (18, 20, 24, 255)
    black_side = (10, 12, 16, 255)
    dark_panel = (28, 34, 42, 255)
    red = (178, 38, 42, 255)
    red_dark = (99, 18, 25, 255)
    screen = (22, 47, 56, 255)
    glass = (43, 80, 91, 255)
    trim = (238, 207, 111, 255)
    blue = (59, 178, 219, 255)
    green = (87, 194, 101, 255)

    # Front-biased concept with obvious cabinet depth but no named camera-angle instruction.
    poly([(228, 132), (488, 100), (574, 168), (316, 214)], (28, 30, 36, 255), (4, 5, 8, 255), 6)
    poly([(316, 214), (574, 168), (590, 604), (326, 650)], black, (4, 5, 8, 255), 6)
    poly([(228, 132), (316, 214), (326, 650), (196, 562)], black_side, (4, 5, 8, 255), 6)
    poly([(210, 620), (526, 574), (616, 662), (164, 716)], black_side, (4, 5, 8, 255), 6)

    poly([(258, 154), (474, 128), (536, 178), (320, 214)], red, red_dark, 5)
    poly([(284, 170), (462, 150), (504, 182), (326, 210)], (217, 86, 69, 255), None)

    poly([(320, 250), (520, 220), (526, 394), (326, 434)], (4, 5, 8, 255), trim, 5)
    poly([(350, 280), (494, 258), (498, 370), (354, 400)], screen, None)
    poly([(374, 306), (474, 292), (474, 326), (374, 342)], glass, None)

    poly([(296, 460), (548, 410), (578, 486), (314, 548)], dark_panel, (5, 7, 11, 255), 5)
    draw.ellipse((350 * scale, 462 * scale, 402 * scale, 514 * scale), fill=(5, 7, 11, 255), outline=trim, width=4 * scale)
    draw.line([(376 * scale, 464 * scale), (362 * scale, 424 * scale)], fill=(218, 222, 225, 255), width=7 * scale)
    draw.ellipse((346 * scale, 404 * scale, 382 * scale, 440 * scale), fill=red, outline=red_dark, width=3 * scale)

    for x, y, fill in [(438, 462, blue), (480, 454, green), (522, 446, red)]:
      draw.ellipse((x * scale, y * scale, (x + 32) * scale, (y + 32) * scale), fill=fill, outline=(4, 5, 8, 255), width=3 * scale)

    poly([(354, 558), (474, 536), (478, 606), (356, 628)], (8, 10, 14, 255), (67, 72, 82, 255), 4)
    rect((376, 574, 406, 606), (44, 47, 55, 255), None, 1, 4)
    rect((434, 562, 464, 594), (44, 47, 55, 255), None, 1, 4)

    poly([(574, 168), (624, 206), (638, 620), (590, 604)], (36, 38, 44, 255), (4, 5, 8, 255), 4)

    resized = image.resize((768, 768), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(path)


def find_glb(value):
    if isinstance(value, str) and value.lower().endswith(".glb") and Path(value).exists():
        return Path(value)
    if isinstance(value, dict):
        for item in value.values():
            found = find_glb(item)
            if found:
                return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = find_glb(item)
            if found:
                return found
    return None


def find_stats(value):
    if isinstance(value, dict) and ("number_of_faces" in value or "number_of_vertices" in value):
        return value
    if isinstance(value, dict):
        for item in value.values():
            found = find_stats(item)
            if found:
                return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = find_stats(item)
            if found:
                return found
    return None


def find_seed(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in {"seed", "returned_seed", "returnedseed"} and type(item) is int:
                return item
        for item in value.values():
            found = find_seed(item)
            if found is not None:
                return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = find_seed(item)
            if found is not None:
                return found
    return None


def write_metadata(asset_id, prompt, seed, result, paths):
    returned_seed = find_seed(result)
    metadata = {
        "id": asset_id,
        "kind": "ai_image_to_3d_glb",
        "status": "raw_generated",
        "units": "arcade-meter-ish",
        "designIntent": (
            "Sixth-slot classic upright arcade cabinet candidate generated through Hunyuan3D "
            "without replacing the current primitive cabinets."
        ),
        "conceptImage": str(paths["concept"].relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "sourceGlb": str(paths["raw"].relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "runtimeGlb": str(paths["runtime"].relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "preview": str(paths["preview"].relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "generator": {
            "kind": "image_to_3d",
            "space": "tencent/Hunyuan3D-2",
            "model": "tencent/Hunyuan3D-2/hunyuan3d-dit-v2-0",
            "endpoint": "/shape_generation",
            "seed": seed,
            "steps": 24,
            "guidanceScale": 5.0,
            "octreeResolution": 256,
            "numChunks": 8000,
            "randomizeSeed": False,
            "removeBackground": True,
            "sourceConceptPrompt": prompt,
        },
        "rawResult": {
            "meshStats": find_stats(result),
            "returnedSeed": seed if returned_seed is None else returned_seed,
        },
    }
    paths["metadata"].write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Generate a cabinet source GLB with Hunyuan3D.")
    parser.add_argument("--asset-id", default=DEFAULT_ASSET_ID)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asset_id = args.asset_id.strip()
    if not asset_id:
        raise SystemExit("asset id is required")

    source_dir = PROJECT_ROOT / "assets" / "3d" / "source" / asset_id
    paths = {
        "source_dir": source_dir,
        "concept": source_dir / "concept.png",
        "raw": source_dir / "raw.glb",
        "prompt": source_dir / "prompt.md",
        "metadata": source_dir / "source.json",
        "runtime": PROJECT_ROOT / "assets" / "3d" / "runtime" / f"{asset_id}.glb",
        "preview": PROJECT_ROOT / "assets" / "3d" / "previews" / f"{asset_id}.png",
    }

    source_dir.mkdir(parents=True, exist_ok=True)
    draw_concept(paths["concept"])
    paths["prompt"].write_text("# Prompt\n\n" + args.prompt + "\n", encoding="utf-8")

    client = Client("tencent/Hunyuan3D-2")
    result = client.predict(
        caption=args.prompt,
        image=handle_file(str(paths["concept"])),
        mv_image_front=None,
        mv_image_back=None,
        mv_image_left=None,
        mv_image_right=None,
        steps=24,
        guidance_scale=5.0,
        seed=args.seed,
        octree_resolution=256,
        check_box_rembg=True,
        num_chunks=8000,
        randomize_seed=False,
        api_name="/shape_generation",
    )

    generated_glb = find_glb(result)
    if not generated_glb:
        raise RuntimeError(f"Hunyuan3D response did not include a GLB path: {result!r}")

    shutil.copyfile(generated_glb, paths["raw"])
    write_metadata(asset_id, args.prompt, args.seed, result, paths)
    print(
        json.dumps(
            {
                "concept": str(paths["concept"]),
                "raw": str(paths["raw"]),
                "metadata": str(paths["metadata"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
