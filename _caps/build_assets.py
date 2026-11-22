"""Generate App Store marketing assets (iPhone + iPad screenshots, Header, Search Results)
from real mobile-app captures. Warm brand background + serif caption + framed phone.
No pricing-of-app/URLs/copyright per Apple asset rules."""
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
        return ImageFont.truetype(LIB + f, s)
    except Exception:
        return ImageFont.load_default()


def serif(s):
    return font("LiberationSerif-Bold.ttf", s)


def serif_reg(s):
    return font("LiberationSerif-Regular.ttf", s)


def sans(s):
    return font("LiberationSans-Regular.ttf", s)


def load_cap(name):
    im = Image.open(os.path.join(CAPS, name)).convert("RGB")
    return im


def rounded(im, rad):
    """Return RGBA copy with rounded corners."""
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, im.size[0], im.size[1]], radius=rad, fill=255)
    im.putalpha(mask)
    return im


def wrap_lines(draw, text, fnt, maxw):
    out = []
    for para in text.split("\n"):
        words = para.split(" ")
        line = ""
        for w in words:
            t = (line + " " + w).strip()
            if draw.textlength(t, font=fnt) <= maxw or not line:
                line = t
            else:
                out.append(line)
                line = w
        out.append(line)
    return out


def draw_center_text(draw, cx, y, lines, fnt, fill, lh_mult=1.14):
    asc, desc = fnt.getmetrics()
    lh = int((asc + desc) * lh_mult)
    for ln in lines:
        w = draw.textlength(ln, font=fnt)
        draw.text((cx - w / 2, y), ln, font=fnt, fill=fill)
        y += lh
    return y


def accent(canvas, W, H):
    """Subtle brand accent: soft clay arc blob, low opacity, top-right."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = int(W * 0.55)
    d.ellipse([W - r, -int(r * 0.45), W + int(r * 0.45), r], fill=(165, 81, 43, 26))
    r2 = int(W * 0.4)
    d.ellipse([-int(r2 * 0.4), H - r2, r2, H + int(r2 * 0.4)], fill=(14, 77, 82, 20))
    layer = layer.filter(ImageFilter.GaussianBlur(int(W * 0.02)))
    canvas.alpha_composite(layer)


def place_phone(canvas, cap, cx, top, phone_w):
    """Paste a framed, rounded, shadowed phone screenshot centered at cx, starting at top."""
    ratio = cap.size[1] / cap.size[0]  # h/w ~2.174
    phone_w = int(phone_w)
    phone_h = int(phone_w * ratio)
    scr = cap.resize((phone_w, phone_h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.4, percent=90, threshold=2))
    rad = int(phone_w * 0.085)
    bez = max(8, int(phone_w * 0.02))
    bw, bh = phone_w + bez * 2, phone_h + bez * 2
    x = int(cx - bw / 2)
    # shadow
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([x, top + int(bh * 0.02), x + bw, top + bh + int(bh * 0.02)], radius=rad + bez, fill=(11, 36, 39, 95))
    sh = sh.filter(ImageFilter.GaussianBlur(int(phone_w * 0.045)))
    canvas.alpha_composite(sh)
    # bezel
    bezimg = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    ImageDraw.Draw(bezimg).rounded_rectangle([0, 0, bw, bh], radius=rad + bez, fill=TEAL_DARK + (255,))
    canvas.alpha_composite(bezimg, (x, top))
    # screen
    scr_r = rounded(scr, rad)
    canvas.alpha_composite(scr_r, (x + bez, top + bez))
    return top + bh


def save(canvas, name):
    rgb = Image.new("RGB", canvas.size, WARM)
    rgb.paste(canvas, mask=canvas.split()[3])
    path = os.path.join(OUT, name)
    rgb.save(path, "PNG", optimize=True)
    print(name, rgb.size, round(os.path.getsize(path) / 1024), "KB")


def phone_slide(cap_name, caption, W, H, max_w_frac, cap_fs, cap_top_frac=0.05):
    canvas = Image.new("RGBA", (W, H), WARM + (255,))
    accent(canvas, W, H)
    d = ImageDraw.Draw(canvas)
    cf = serif(cap_fs)
    lines = wrap_lines(d, caption, cf, int(W * 0.84))
    ytop = int(H * cap_top_frac)
    ybot = draw_center_text(d, W / 2, ytop, lines, cf, TEAL)
    # phone area
    phone_top = ybot + int(H * 0.035)
    margin_bottom = int(H * 0.05)
    avail_h = H - phone_top - margin_bottom
    cap = load_cap(cap_name)
    ratio = cap.size[1] / cap.size[0]
    phone_w = min(W * max_w_frac, avail_h / ratio)
    cx = W / 2
    place_phone(canvas, cap, cx, phone_top, phone_w)
    return canvas


FEATURES = [
    ("01_dashboard.jpg", "Aged care,\nfinally made clear"),
    ("04_statementdecoder.jpg", "Your statement,\ndecoded in plain English"),
    ("05_invoicechecker.jpg", "Catch invoice errors\nbefore you pay"),
    ("06_budget.jpg", "Know what your\nbudget really covers"),
    ("07_careplan.jpg", "Spot the gaps in\nany support plan"),
    ("08_pricechecker.jpg", "See if a provider's\nrate is fair"),
]

# iPhone 1206x2622
for i, (cap, capt) in enumerate(FEATURES, 1):
    c = phone_slide(cap, capt, 1206, 2622, 0.78, 92, 0.045)
    save(c, f"iphone_{i}_{cap.split('_',1)[1].replace('.jpg','')}.png")

# iPad 2048x2732
for i, (cap, capt) in enumerate(FEATURES, 1):
    c = phone_slide(cap, capt, 2048, 2732, 0.46, 104, 0.05)
    save(c, f"ipad_{i}_{cap.split('_',1)[1].replace('.jpg','')}.png")


# Header 3840x1646
def build_header():
    W, H = 3840, 1646
    canvas = Image.new("RGBA", (W, H), WARM + (255,))
    accent(canvas, W, H)
    d = ImageDraw.Draw(canvas)
    wf = serif(240)
    tf = serif_reg(96)
    vf = sans(50)
    # centered text block upper area
    word = "Wayly"
    ww = d.textlength(word, font=wf)
    d.text((W / 2 - ww / 2, 150), word, font=wf, fill=TEAL)
    tag = "Aged Care, Made Clear"
    tw = d.textlength(tag, font=tf)
    d.text((W / 2 - tw / 2, 430), tag, font=tf, fill=CLAY)
    val = "Decode statements  ·  Check invoices  ·  Know your budget"
    vw = d.textlength(val, font=vf)
    d.text((W / 2 - vw / 2, 580), val, font=vf, fill=MUT)
    # row of 3 phones centered
    phones = ["01_dashboard.jpg", "04_statementdecoder.jpg", "05_invoicechecker.jpg"]
    pw = 430
    gap = 90
    total = len(phones) * pw + (len(phones) - 1) * gap
    startx = (W - total) / 2 + pw / 2
    for j, p in enumerate(phones):
        cx = startx + j * (pw + gap)
        place_phone(canvas, load_cap(p), cx, 700, pw)
    save(canvas, "header_3840x1646.png")


# Search results 1920x1280
def build_search():
    W, H = 1920, 1280
    canvas = Image.new("RGBA", (W, H), WARM + (255,))
    accent(canvas, W, H)
    d = ImageDraw.Draw(canvas)
    wf = serif(190)
    tf = serif_reg(78)
    vf = sans(42)
    tx = 150
    d.text((tx, 360), "Wayly", font=wf, fill=TEAL)
    d.text((tx, 600), "Aged Care, Made Clear", font=tf, fill=CLAY)
    for k, ln in enumerate(["Decode your monthly statement.", "Check every invoice line.", "Track your Support at Home budget."]):
        d.text((tx, 720 + k * 62), ln, font=vf, fill=MUT)
    # phone on right
    place_phone(canvas, load_cap("01_dashboard.jpg"), W - 430, 150, 540)
    save(canvas, "search_1920x1280.png")


build_header()
build_search()
print("ALL DONE")
