"""Generate App Store CREATIVE assets (Header + Search Results) at every size
App Store Connect accepts, following Apple asset best practices:
 - brand-focused, single clear idea
 - no pricing / URLs / copyright symbols
 - legible text, focal content kept in a safe centre area
Header       : 3840x1646  and  5244x2950 (universal)
Search Result: 1920x1280, 3840x2560  and  5244x2950 (universal)
Reuses the warm-brand look + real mobile captures from build_assets.py."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CAPS = "/app/_caps"
OUT = "/app/frontend/public/appstore"
os.makedirs(OUT, exist_ok=True)

WARM = (251, 248, 243)
TEAL = (14, 77, 82)
TEAL_DARK = (11, 36, 39)
CLAY = (165, 81, 43)
MUT = (110, 118, 112)
LIB = "/usr/share/fonts/truetype/liberation/"


def font(f, s):
    try:
        return ImageFont.truetype(LIB + f, int(s))
    except Exception:
        return ImageFont.load_default()


def serif(s):
    return font("LiberationSerif-Bold.ttf", s)


def serif_reg(s):
    return font("LiberationSerif-Regular.ttf", s)


def sans(s):
    return font("LiberationSans-Regular.ttf", s)


def load_cap(name):
    return Image.open(os.path.join(CAPS, name)).convert("RGB")


def rounded(im, rad):
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0], im.size[1]], radius=rad, fill=255)
    im.putalpha(mask)
    return im


def accent(canvas, W, H):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = int(W * 0.55)
    d.ellipse([W - r, -int(r * 0.45), W + int(r * 0.45), r], fill=(165, 81, 43, 26))
    r2 = int(W * 0.4)
    d.ellipse([-int(r2 * 0.4), H - r2, r2, H + int(r2 * 0.4)], fill=(14, 77, 82, 20))
    layer = layer.filter(ImageFilter.GaussianBlur(int(W * 0.02)))
    canvas.alpha_composite(layer)


def place_phone(canvas, cap, cx, top, phone_w):
    ratio = cap.size[1] / cap.size[0]
    phone_w = int(phone_w)
    phone_h = int(phone_w * ratio)
    up = phone_w / cap.size[0]
    pct = 120 if up > 2 else 90
    scr = cap.resize((phone_w, phone_h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=pct, threshold=2))
    rad = int(phone_w * 0.085)
    bez = max(8, int(phone_w * 0.02))
    bw, bh = phone_w + bez * 2, phone_h + bez * 2
    x = int(cx - bw / 2)
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x, top + int(bh * 0.02), x + bw, top + bh + int(bh * 0.02)], radius=rad + bez, fill=(11, 36, 39, 95))
    sh = sh.filter(ImageFilter.GaussianBlur(int(phone_w * 0.045)))
    canvas.alpha_composite(sh)
    bezimg = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    ImageDraw.Draw(bezimg).rounded_rectangle([0, 0, bw, bh], radius=rad + bez, fill=TEAL_DARK + (255,))
    canvas.alpha_composite(bezimg, (x, top))
    canvas.alpha_composite(rounded(scr, rad), (x + bez, top + bez))


def save(canvas, name):
    rgb = Image.new("RGB", canvas.size, WARM)
    rgb.paste(canvas, mask=canvas.split()[3])
    path = os.path.join(OUT, name)
    rgb.save(path, "PNG", optimize=True)
    print(name, rgb.size, round(os.path.getsize(path) / 1024), "KB")


def ctext(d, cx, y, text, fnt, fill):
    w = d.textlength(text, font=fnt)
    d.text((cx - w / 2, y), text, font=fnt, fill=fill)


# ---- Header / Universal layout (scales by height; centred, safe-area aware) ----
def build_header(W, H, name):
    s = H / 1646.0
    canvas = Image.new("RGBA", (W, H), WARM + (255,))
    accent(canvas, W, H)
    d = ImageDraw.Draw(canvas)
    ctext(d, W / 2, 0.085 * H, "Wayly", serif(240 * s), TEAL)
    ctext(d, W / 2, 0.255 * H, "Aged Care, Made Clear", serif_reg(96 * s), CLAY)
    ctext(d, W / 2, 0.350 * H, "Decode statements   ·   Check invoices   ·   Know your budget", sans(50 * s), MUT)
    phones = ["01_dashboard.jpg", "04_statementdecoder.jpg", "05_invoicechecker.jpg"]
    pw = 430 * s
    gap = 100 * s
    total = len(phones) * pw + (len(phones) - 1) * gap
    startx = (W - total) / 2 + pw / 2
    for j, p in enumerate(phones):
        place_phone(canvas, load_cap(p), startx + j * (pw + gap), int(0.43 * H), pw)
    save(canvas, name)


# ---- Search layout 3:2 (text left, phone right; scales by width) ----
def build_search(W, H, name):
    s = W / 1920.0
    canvas = Image.new("RGBA", (W, H), WARM + (255,))
    accent(canvas, W, H)
    d = ImageDraw.Draw(canvas)
    tx = int(0.078 * W)
    d.text((tx, 0.281 * H), "Wayly", font=serif(190 * s), fill=TEAL)
    d.text((tx, 0.469 * H), "Aged Care, Made Clear", font=serif_reg(78 * s), fill=CLAY)
    lines = ["Decode your monthly statement.", "Check every invoice line.", "Track your Support at Home budget."]
    for k, ln in enumerate(lines):
        d.text((tx, 0.5625 * H + k * 62 * s), ln, font=sans(42 * s), fill=MUT)
    place_phone(canvas, load_cap("01_dashboard.jpg"), W - int(430 * s), int(0.117 * H), int(540 * s))
    save(canvas, name)


# Header slot
build_header(3840, 1646, "header_3840x1646.png")
build_header(5244, 2950, "header_5244x2950.png")   # universal (works for both slots)

# Search Results slot
build_search(1920, 1280, "search_1920x1280.png")
build_search(3840, 2560, "search_3840x2560.png")
build_header(5244, 2950, "search_5244x2950.png")   # universal 16:9 for search slot

print("ALL DONE")
