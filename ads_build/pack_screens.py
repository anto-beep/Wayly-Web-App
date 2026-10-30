#!/usr/bin/env python3
import os, glob, shutil, csv
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None

OUT = "/app/ads_build/screens"
LAB = os.path.join(OUT, "labelled")
FONT_DIR = "/app/ads_build/fonts"
TEAL = (14, 77, 82)

files = sorted(glob.glob(os.path.join(LAB, "*.png")))
# contact sheet
cols, cellW, cellH, top = 6, 460, 440, 90
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cellW, top + rows * cellH), (255, 255, 255))
d = ImageDraw.Draw(sheet)
tf = ImageFont.truetype(os.path.join(FONT_DIR, "Fraunces.ttf"), 44)
try:
    tf.set_variation_by_axes([144, 560, 0, 0])
except Exception:
    pass
cap = ImageFont.truetype(os.path.join(FONT_DIR, "IBMPlexMono.ttf"), 13)
d.text((40, 28), f"Wayly web app  ·  tool + backend screens  ·  {len(files)} screenshots", font=tf, fill=TEAL)
for i, fp in enumerate(files):
    r, c = divmod(i, cols)
    cx, cy = c * cellW, top + r * cellH
    im = Image.open(fp).convert("RGB")
    im.thumbnail((cellW - 40, cellH - 70), Image.LANCZOS)
    ox = cx + (cellW - im.width) // 2
    oy = cy + 12
    sheet.paste(im, (ox, oy))
    d.rectangle([ox, oy, ox + im.width, oy + im.height], outline=(214, 222, 218), width=1)
    d.text((cx + 14, cy + cellH - 46), os.path.basename(fp), font=cap, fill=(40, 60, 58))
sheet.save(os.path.join(OUT, "contact_sheet.png"), "PNG", optimize=True)
print("contact sheet", sheet.size)

# stage + zip
stage = "/tmp/screenstage"
shutil.rmtree(stage, ignore_errors=True)
os.makedirs(stage + "/tools", exist_ok=True)
os.makedirs(stage + "/app", exist_ok=True)
for fp in files:
    name = os.path.basename(fp)
    sub = "tools" if name.startswith("wayly_tool_") else "app"
    shutil.copy(fp, os.path.join(stage, sub, name))
shutil.copy(os.path.join(OUT, "contact_sheet.png"), os.path.join(stage, "contact_sheet.png"))
if os.path.exists(os.path.join(OUT, "index.csv")):
    shutil.copy(os.path.join(OUT, "index.csv"), os.path.join(stage, "index.csv"))
zippath = "/app/ads_build/wayly_backend_screens_2026-11.zip"
if os.path.exists(zippath):
    os.remove(zippath)
shutil.make_archive(zippath[:-4], "zip", stage)
print("zip", os.path.getsize(zippath), "bytes")
