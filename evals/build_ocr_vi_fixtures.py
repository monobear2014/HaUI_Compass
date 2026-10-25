"""Deterministic synthetic image/scan fixtures generated from versioned gold labels.

Run with the API dev dependencies. No model generates either labels or source text.
Every variant of one document stays in the same split. Never use participant uploads.
"""

import hashlib
import io
import json
import time
from pathlib import Path

import matplotlib
from matplotlib.mathtext import math_to_image
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "evals/datasets/ocr-ai-vi-v1.json"
FIXTURES = ROOT / "evals/ocr/fixtures"


def draw_case(case: dict) -> Image.Image:
    font_path = Path(matplotlib.get_data_path()) / "fonts/ttf/DejaVuSans.ttf"
    font = ImageFont.truetype(str(font_path), 28)
    image = Image.new("RGB", (1400, 1500), "white")
    draw = ImageDraw.Draw(image)
    y = 40
    for paragraph in case["paragraphs"]:
        # Wrap only at spaces; do not alter Unicode or label values.
        line = ""
        for word in paragraph.split():
            if draw.textlength(line + " " + word, font=font) > 1300:
                draw.text((40, y), line, font=font, fill="black")
                y += 42
                line = word
            else:
                line = (line + " " + word).strip()
        draw.text((40, y), line, font=font, fill="black")
        y += 60
    for table in case["tables"]:
        width = 1300 // len(table["headers"])
        for row in [table["headers"], *table["rows"]]:
            for index, text in enumerate(row):
                x = 40 + index * width
                draw.rectangle((x, y, x + width, y + 60), outline="black", width=2)
                draw.text((x + 12, y + 12), text, font=font, fill="black")
            y += 60
        y += 30
    for formula in case["formulas"]:
        buffer = io.BytesIO()
        math_to_image("$" + formula + "$", buffer, dpi=180, format="png", color="black")
        with Image.open(buffer) as rendered:
            rendered = rendered.convert("RGB")
            rendered.thumbnail((1300, 250))
            image.paste(rendered, (40, y))
            y += rendered.height + 35
    return image.crop((0, 0, 1400, max(400, y + 40)))


def build() -> dict:
    data = json.loads(DATASET.read_text())
    FIXTURES.mkdir(parents=True, exist_ok=True)
    manifest = {"dataset_sha256": hashlib.sha256(DATASET.read_bytes()).hexdigest(), "fixtures": []}
    for case in data["cases"]:
        image = draw_case(case)
        for suffix in ["png", "pdf"]:
            name = case["id"] + "." + suffix
            path = FIXTURES / name
            image.save(path, format="PNG" if suffix == "png" else "PDF", resolution=150,
                       creationDate=time.gmtime(0), modDate=time.gmtime(0))
            manifest["fixtures"].append({
                "id": case["id"], "split": case["split"], "file": name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    (FIXTURES.parent / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    manifest = build()
    print(json.dumps({"synthetic_fixtures": len(manifest["fixtures"])}))
