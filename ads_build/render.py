#!/usr/bin/env python3
"""Wayly Meta ad render engine -> 40 PNGs + contact sheet + manifest.

Clean, well-spaced Wayly social style: Fraunces serif headline (upright teal +
italic clay accent), IBM Plex Mono eyebrow, Inter body, warm-ivory / deep-teal
grounds, ONE tidy white card per ad using REAL Wayly document data and real
decoded results. No url text, no 'example' labels, numbers shown for real.
"""
import os, csv, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE = "/app/ads_build"
OUT = os.path.join(BASE, "out")
FONT_DIR = os.path.join(BASE, "fonts")
BRAND = "/app/frontend/public/branding/png"

CREAM_BG = (246, 241, 231)
TEAL_BG  = (13, 74, 79)
CARD     = (255, 255, 255)
TEAL     = (14, 77, 82)
TEAL_DEEP= (10, 56, 60)
CLAY     = (168, 84, 45)
GOLD     = (216, 157, 74)
SAGE     = (122, 155, 128)
SLATE    = (49, 76, 72)
INK      = (12, 34, 34)
CREAM    = (246, 241, 231)
CREAM_IT = (235, 226, 207)
CREAM_BODY = (214, 226, 221)
CREAM_MUTE = (198, 215, 208)
BORDER   = (228, 226, 214)
DOCGREY  = (120, 130, 122)
SAGE_TINT= (231, 239, 231)
SOFTTEAL = (211, 228, 224)

RATIOS = [("1x1", 1080, 1080), ("4x5", 1080, 1350),
          ("9x16", 1080, 1920), ("191x1", 1200, 628)]
AD_SLUGS = ["a_decoder", "b_october_check", "c_big_number",
            "d_invoice_questions", "e_founder"]

# ---- real document data ----
STMT = dict(provider="Blueberry Care", client="Sam Burke", period="01/08/2026 to 31/08/2026")
ROWS_A = [("Nursing, wound dressing", "Clinical Supports", "$103.65"),
          ("Domestic assistance", "Everyday Living", "$136.80"),
          ("Personal care, morning", "Independence", "$76.50")]
TOTAL_BILLED, GOV_FUNDED, PAID = "$4,604.70", "$4,317.30", "$287.40"
INV = dict(provider="Glorious Services", service="Domestic assistance", amount="$102.50",
           reason="Rate looks above the published price")
QUESTIONS = ["What does this cover?", "Is it within the published price?",
             "Was it in the plan?", "Is there a visit record?"]

FPATH = {"fraunces": "Fraunces.ttf", "it": "Fraunces-Italic.ttf",
         "inter": "Inter.ttf", "mono": "IBMPlexMono.ttf"}
_fc = {}
def F(kind, size, weight=400):
    key = (kind, size, weight)
    if key in _fc:
        return _fc[key]
    f = ImageFont.truetype(os.path.join(FONT_DIR, FPATH[kind]), size)
    try:
        if kind in ("fraunces", "it"):
            f.set_variation_by_axes([144, weight, 0, 0])
        elif kind == "inter":
            f.set_variation_by_axes([32, weight])
    except Exception:
        pass
    _fc[key] = f
    return f

def _crop_mark(name):
    im = Image.open(os.path.join(BRAND, name)).convert("RGBA")
    left = im.crop((0, 0, int(im.width * 0.26), im.height))
    return left.crop(left.getbbox())
MARK_LIGHT = _crop_mark("wayly-lockup-navy-1024.png")
MARK_DARK  = _crop_mark("wayly-lockup-white-1024.png")


class Canvas:
    def __init__(self, W, H, ratio, variant):
        self.W, self.H, self.ratio, self.variant = W, H, ratio, variant
        self.landscape = (ratio == "191x1")
        self.v2 = (variant == "v2")
        self.texts = []
        self.last_head_size = 0
        if not self.v2:
            self.bg, self.head_up, self.head_it = CREAM_BG, TEAL, CLAY
            self.eyebrow_c, self.body_c, self.cta_c = CLAY, SLATE, CLAY
            self.mark, self.word_c = MARK_LIGHT, TEAL
        else:
            self.bg, self.head_up, self.head_it = TEAL_BG, CREAM, CREAM_IT
            self.eyebrow_c, self.body_c, self.cta_c = CREAM_MUTE, CREAM_BODY, GOLD
            self.mark, self.word_c = MARK_DARK, CREAM
        self.img = Image.new("RGBA", (W, H), self.bg + (255,))
        self.d = ImageDraw.Draw(self.img)
        if self.v2:
            self._scanlines()
        if self.landscape:
            self.sz = dict(eyebrow=24, body=30, cta=32, hdr=30, sub=20, row=26,
                           cat=18, amt=28, stat=34)
        else:
            self.sz = dict(eyebrow=31, body=43, cta=45, hdr=38, sub=26, row=35,
                           cat=23, amt=38, stat=46)

    def _scanlines(self):
        lay = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        for yy in range(0, self.H, 6):
            ld.line([(0, yy), (self.W, yy)], fill=(255, 255, 255, 8))
        self.img = Image.alpha_composite(self.img, lay)
        self.d = ImageDraw.Draw(self.img)

    def tl(self, s, font):
        return int(self.d.textlength(s, font=font))

    def wrap(self, s, font, maxw):
        words, lines, cur = s.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if (not cur) or self.tl(t, font) <= maxw:
                cur = t
            else:
                lines.append(cur); cur = w
        if cur:
            lines.append(cur)
        return lines

    def para_h(self, s, font, maxw, lh_mul=1.34):
        lines = self.wrap(s, font, maxw)
        lh = int(font.size * lh_mul)
        return lines, lh, len(lines) * lh

    def para(self, s, font, fill, x, y, maxw, align="left", lh_mul=1.34, track=True):
        lines, lh, th = self.para_h(s, font, maxw, lh_mul)
        cy = y
        for ln in lines:
            w = self.tl(ln, font)
            lx = x if align == "left" else x + (maxw - w) // 2 if align == "center" else x + (maxw - w)
            self.d.text((lx, cy), ln, font=font, fill=fill)
            cy += lh
        if track:
            self.texts.append(s)
        return th

    def _rich(self, runs, size, maxw):
        fu, fi = F("fraunces", size, 430), F("it", size, 440)
        space = self.tl(" ", fu)
        toks = []
        for text, style in runs:
            for w in text.split(" "):
                if w:
                    toks.append((w, style))
        lines, cur, curw = [], [], 0
        for w, st in toks:
            f = fi if st == "it" else fu
            ww = self.tl(w, f)
            add = ww + (space if cur else 0)
            if cur and curw + add > maxw:
                lines.append(cur); cur = [(w, st, ww)]; curw = ww
            else:
                cur.append((w, st, ww)); curw += add
        if cur:
            lines.append(cur)
        lh = int(size * 1.12)
        th = len(lines) * lh
        mlw = max(sum(w for _, _, w in ln) + space * (len(ln) - 1) for ln in lines)
        return lines, fu, fi, lh, th, mlw, space

    def headline(self, runs, x, y, maxw, maxh, align="left", base=None, floor=None):
        size = base or 140
        floor = floor or 74
        while size > floor:
            lines, fu, fi, lh, th, mlw, space = self._rich(runs, size, maxw)
            if th <= maxh and mlw <= maxw:
                break
            size -= 3
        lines, fu, fi, lh, th, mlw, space = self._rich(runs, size, maxw)
        self.last_head_size = size
        cy = y
        for ln in lines:
            linew = sum(w for _, _, w in ln) + space * (len(ln) - 1)
            lx = x if align == "left" else x + (maxw - linew) // 2 if align == "center" else x + (maxw - linew)
            for w, st, ww in ln:
                f = fi if st == "it" else fu
                self.d.text((lx, cy), w, font=f, fill=(self.head_it if st == "it" else self.head_up))
                lx += ww + space
            cy += lh
        self.texts.append(re.sub(r"\s+", " ", "".join(t for t, _ in runs)).strip())
        return th

    def eyebrow(self, text, x, y, color=None, align="left", maxw=None, size=None):
        size = size or self.sz["eyebrow"]
        f = F("mono", size)
        track = max(2, int(size * 0.14))
        total = sum(self.tl(c, f) + track for c in text) - track
        if align == "center" and maxw:
            x = x + (maxw - total) // 2
        cx = x
        for ch in text:
            self.d.text((cx, y), ch, font=f, fill=color or self.eyebrow_c)
            cx += self.tl(ch, f) + track
        self.texts.append(text)
        return total

    def accent(self, x, y, w=136, h=10):
        if self.landscape:
            w, h = int(w * 0.7), 8
        self.d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=CLAY)

    def pill(self, text, x, y, bg, fg, font, padx=22, pady=11, track=True):
        w = self.tl(text, font)
        a, de = font.getmetrics(); bh = a + de
        self.d.rounded_rectangle([x, y, x + w + 2 * padx, y + bh + 2 * pady],
                                 radius=(bh + 2 * pady) // 2, fill=bg)
        self.d.text((x + padx, y + pady - int(de * 0.2)), text, font=font, fill=fg)
        if track:
            self.texts.append(text)
        return w + 2 * padx, bh + 2 * pady

    def shadow(self, box, radius=28, blur=26, alpha=46, dy=16):
        lay = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        x0, y0, x1, y1 = box
        ImageDraw.Draw(lay).rounded_rectangle([x0, y0 + dy, x1, y1 + dy], radius=radius,
                                              fill=(8, 26, 26, alpha))
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
        self.img = Image.alpha_composite(self.img, lay)
        self.d = ImageDraw.Draw(self.img)

    def card(self, box, radius=26, fill=CARD, outline=BORDER, width=2, shadow=True):
        if shadow:
            self.shadow(box)
        self.d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

    def paste(self, tile, x, y):
        self.img.paste(tile, (int(x), int(y)), tile)

    def frame(self):
        W, H = self.W, self.H
        if self.ratio == "9x16":
            ox, oy, bottom = 92, 306, 1234
        elif self.landscape:
            ox, oy, bottom = 60, 50, H - 50
        else:
            ox, oy, bottom = 92, 96, H - 96
        mh = 50 if self.landscape else 64
        mk = self.mark.resize((int(self.mark.width * mh / self.mark.height), mh), Image.LANCZOS)
        self.img.paste(mk, (ox, oy), mk)
        wf = F("fraunces", int(mh * 0.82), 600)
        bb = self.d.textbbox((0, 0), "Wayly", font=wf)
        wy = oy + (mh - (bb[3] - bb[1])) // 2 - bb[1]
        wx = ox + mk.width + int(mh * 0.28)
        self.d.text((wx, wy), "Wayly", font=wf, fill=self.word_c)
        dotw = self.tl("Wayly", wf)
        dr = max(4, int(mh * 0.085))
        self.d.ellipse([wx + dotw + dr, oy + mh - dr * 2 - 4, wx + dotw + 3 * dr, oy + mh - 4], fill=CLAY)
        self.texts.append("Wayly")
        top = oy + mh + (18 if self.landscape else 48)
        return (ox, top, W - ox, bottom)

    # shared head block (eyebrow + headline + accent) -> y below accent
    def head_block(self, eyebrow, runs, x, y, maxw, base, floor, align="left", hero=False):
        self.eyebrow(eyebrow, x, y, align=align, maxw=maxw)
        hy = y + int(self.sz["eyebrow"] * 1.8)
        maxh = int(base * 1.12 * (3.3 if hero else 2.4))
        hh = self.headline(runs, x, hy, maxw, maxh, align=align, base=base, floor=floor)
        ay = hy + hh + int(self.last_head_size * 0.16)
        ax = x if align != "center" else x + (maxw - 136) // 2
        self.accent(ax, ay)
        return ay + (8 if self.landscape else 12) + (12 if self.landscape else 18)


# ============================ cards ============================
def _decoded_card(c, box):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    c.card(box)
    pad = int(w * 0.06)
    cx, cxr = x0 + pad, x1 - pad
    cy = y0 + pad
    c.d.text((cx, cy), STMT["provider"], font=F("fraunces", c.sz["hdr"], 560), fill=TEAL)
    c.texts.append(STMT["provider"])
    cy += int(c.sz["hdr"] * 1.25)
    c.d.text((cx, cy), f'{STMT["client"]}  ·  {STMT["period"]}', font=F("mono", c.sz["sub"]), fill=DOCGREY)
    c.texts += [STMT["client"], STMT["period"]]
    cy += int(c.sz["sub"] * 1.9)
    c.d.line([cx, cy, cxr, cy], fill=BORDER, width=2)
    cy += int(pad * 0.45)
    strip_h = int(c.sz["stat"] * 1.28 + c.sz["sub"] * 1.7)
    rows_bottom = y1 - pad - strip_h
    minrh = int(c.sz["row"] * 1.9)
    navail = max(1, min(len(ROWS_A), int((rows_bottom - cy) / minrh)))
    rows = ROWS_A[:navail]
    rf = F("inter", c.sz["row"], 500)
    cf = F("mono", c.sz["cat"])
    af = F("inter", c.sz["amt"], 600)
    rh = (rows_bottom - cy) / len(rows)
    for svc, cat, amt in rows:
        midy = cy + rh / 2
        c.d.text((cx, midy - c.sz["row"] * 0.95), svc, font=rf, fill=INK)
        c.d.text((cx, midy + c.sz["row"] * 0.16), cat, font=cf, fill=CLAY)
        aw = c.tl(amt, af)
        c.d.text((cxr - aw, midy - c.sz["amt"] * 0.5), amt, font=af, fill=TEAL)
        c.texts += [svc, cat, amt]
        cy += rh
    sy = y1 - pad - strip_h
    c.d.rounded_rectangle([cx, sy, cxr, y1 - pad], radius=16, fill=SAGE_TINT)
    spx = cx + int(pad * 0.5)
    c.d.text((spx, sy + int(strip_h * 0.20)), "Paid by the participant", font=F("mono", c.sz["sub"]), fill=SLATE)
    c.texts.append("Paid by the participant")
    vf = F("fraunces", c.sz["stat"], 560)
    vy = sy + int(strip_h * 0.20) + int(c.sz["sub"] * 1.45)
    c.d.text((spx, vy), PAID, font=vf, fill=TEAL)
    pw = c.tl(PAID, vf)
    c.d.text((spx + pw + 16, vy + int(c.sz["stat"] * 0.42)),
             f"of {TOTAL_BILLED} billed", font=F("mono", c.sz["sub"]), fill=DOCGREY)
    c.texts += [PAID, f"of {TOTAL_BILLED} billed"]


def _bars(c, box):
    x0, y0, x1, y1 = box
    w = x1 - x0
    data = [("Total cost of care", TOTAL_BILLED, 1.0, TEAL if not c.v2 else CREAM),
            ("Government funded", GOV_FUNDED, 4317.30 / 4604.70, SAGE),
            ("Paid by the participant", PAID, 287.40 / 4604.70, CLAY)]
    lf = F("inter", c.sz["row"] + 2, 600)
    vf = F("inter", c.sz["row"], 600)
    group = (y1 - y0) / 3.0
    barh = min(int(group * 0.40), 60 if not c.landscape else 36)
    for i, (label, val, frac, col) in enumerate(data):
        gy = y0 + int(i * group)
        c.d.text((x0, gy), label, font=lf, fill=c.body_c)
        vw = c.tl(val, vf)
        c.d.text((x1 - vw, gy), val, font=vf, fill=c.body_c)
        c.texts += [label, val]
        by = gy + int(c.sz["row"] * 1.7)
        bw = max(barh, int(w * frac))
        c.d.rounded_rectangle([x0, by, x0 + bw, by + barh], radius=barh // 2, fill=col)


def _summary_card(c, box):
    x0, y0, x1, y1 = box
    w = x1 - x0
    c.card(box)
    pad = int(w * 0.07)
    cx, cxr = x0 + pad, x1 - pad
    cy = y0 + pad
    c.d.text((cx, cy), STMT["provider"], font=F("fraunces", c.sz["hdr"], 560), fill=TEAL)
    c.d.text((cx, cy + int(c.sz["hdr"] * 1.25)), STMT["period"], font=F("mono", c.sz["sub"]), fill=DOCGREY)
    c.texts += [STMT["provider"], STMT["period"]]
    top = cy + int(c.sz["hdr"] * 1.25) + int(c.sz["sub"] * 2.0)
    rows = [("Total cost of care", TOTAL_BILLED, "circle"),
            ("Government funded", GOV_FUNDED, None),
            ("Paid by the participant", PAID, "hi")]
    lf = F("inter", c.sz["row"] + 1, 500)
    vf = F("fraunces", c.sz["stat"] - 2, 560)
    rh = (y1 - pad - top) / 3
    cyy = top
    for label, val, flag in rows:
        midy = cyy + rh / 2
        if flag == "hi":
            c.d.rounded_rectangle([cx - 10, cyy + 6, cxr + 10, cyy + rh - 6], radius=14, fill=SAGE_TINT)
        c.d.text((cx, midy - c.sz["row"] * 0.5), label, font=lf, fill=INK)
        vw = c.tl(val, vf)
        c.d.text((cxr - vw, midy - c.sz["stat"] * 0.5), val, font=vf, fill=TEAL)
        c.texts += [label, val]
        if flag == "circle":
            rr = int(vw * 0.60)
            ry2 = int(rr * 0.34)
            cyc = int(midy - c.sz["stat"] * 0.06)
            c.d.ellipse([cxr - vw // 2 - rr, cyc - ry2, cxr - vw // 2 + rr, cyc + ry2], outline=CLAY, width=5)
        cyy += rh


def _invoice_block(c, x0, y0, x1, h):
    w = x1 - x0
    c.d.text((x0, y0), f'{INV["provider"]}  ·  invoice', font=F("mono", c.sz["sub"]), fill=SLATE)
    c.texts.append(f'{INV["provider"]}  ·  invoice')
    by = y0 + int(c.sz["sub"] * 1.8)
    box = (x0, by, x1, by + h)
    c.card(box, radius=20)
    pad = int(w * 0.05)
    mf = F("inter", c.sz["sub"] + 2, 600)
    af = F("inter", c.sz["row"] + 2, 600)
    if c.landscape:
        sy = by + int(h * 0.20)
        c.d.text((x0 + pad, sy), INV["service"], font=F("fraunces", c.sz["row"] + 2, 520), fill=INK)
        c.texts.append(INV["service"])
        ay = sy + int((c.sz["row"] + 2) * 1.55)
        c.d.text((x0 + pad, ay), INV["amount"], font=af, fill=TEAL)
        c.texts.append(INV["amount"])
        mw = c.tl("Worth asking about", mf) + 40
        c.pill("Worth asking about", x1 - pad - mw, ay - 6, SOFTTEAL, TEAL, mf, padx=20, pady=8)
        c.d.text((x0 + pad, ay + int((c.sz["row"] + 2) * 1.5)), INV["reason"],
                 font=F("inter", c.sz["sub"], 500), fill=DOCGREY)
        c.texts.append(INV["reason"])
    else:
        midy = by + int(h * 0.30)
        c.d.text((x0 + pad, midy - c.sz["row"] * 0.6), INV["service"],
                 font=F("fraunces", c.sz["row"] + 4, 520), fill=INK)
        c.texts.append(INV["service"])
        mw = c.tl("Worth asking about", mf) + 44
        c.pill("Worth asking about", x1 - pad - mw, midy - c.sz["row"] * 0.55, SOFTTEAL, TEAL, mf, padx=22, pady=9)
        aw = c.tl(INV["amount"], af)
        c.d.text((x1 - pad - mw - aw - 24, midy - c.sz["row"] * 0.55), INV["amount"], font=af, fill=TEAL)
        c.texts.append(INV["amount"])
        c.d.text((x0 + pad, by + int(h * 0.64)), INV["reason"], font=F("inter", c.sz["sub"] + 1, 500), fill=DOCGREY)
        c.texts.append(INV["reason"])
    return by + h


def _questions(c, x0, y0, x1, y1, grid=False):
    qf = F("inter", c.sz["body"] - (4 if not c.landscape else 0), 500)
    if grid:
        colw = (x1 - x0) // 2
        rows = [(QUESTIONS[0], QUESTIONS[1]), (QUESTIONS[2], QUESTIONS[3])]
        rh = (y1 - y0) / 2
        for ri, (ql, qr) in enumerate(rows):
            ry = y0 + int(ri * rh)
            for ci, q in enumerate((ql, qr)):
                qx = x0 + ci * colw
                c.d.ellipse([qx, ry + 10, qx + 15, ry + 25], fill=c.cta_c)
                c.para(q, qf, c.body_c, qx + 28, ry, colw - 40, lh_mul=1.2)
    else:
        n = len(QUESTIONS)
        gap = (y1 - y0) / n
        for i, q in enumerate(QUESTIONS):
            ry = y0 + int(i * gap)
            c.d.ellipse([x0, ry + 12, x0 + 16, ry + 28], fill=c.cta_c)
            c.para(q, qf, c.body_c, x0 + 34, ry, x1 - x0 - 34, lh_mul=1.2)


# ============================ renderers ============================
def render_a(c):
    x0, y0, x1, y1 = c.frame()
    W = x1 - x0
    if c.landscape:
        colw = int(W * 0.42)
        c.head_block("Statement Decoder", [("Every line, ", "up"), ("in plain English", "it")],
                     x0, y0, colw, 62, 46)
        _decoded_card(c, (x0 + colw + 40, y0, x1, y1))
    else:
        yb = c.head_block("Statement Decoder", [("Every line, ", "up"), ("in plain English", "it")],
                          x0, y0, W, 92, 66)
        _decoded_card(c, (x0, yb + 18, x1, y1 - 16))


def render_b(c):
    x0, y0, x1, y1 = c.frame()
    W = x1 - x0
    align = "left" if (c.landscape or not c.v2) else "center"
    aw = W if not c.landscape else int(W * 0.78)
    body_f = F("inter", c.sz["body"], 500)
    b1 = "From 01/10/2026, personal care is part of Clinical Supports."
    b2 = "$0 contribution for approved participants."
    base = 92 if c.landscape else 150
    # estimate for vertical centring
    tmp = Canvas.__new__(Canvas)  # not used; compute inline instead
    ey_h = int(c.sz["eyebrow"] * 1.8)
    _, _, _, _, head_th, _, _ = c._rich([("Check personal care shows ", "up"), ("$0", "it")], base, aw if align != "center" else W)
    _, _, b1h = c.para_h(b1, body_f, aw if align != "center" else W)
    _, _, b2h = c.para_h(b2, body_f, aw if align != "center" else W)
    total = ey_h + min(head_th, int(base * 1.12 * 3.3)) + (10 + 44) + b1h + 20 + b2h
    sy = y0 + max(0, ((y1 - y0) - total) // 2)
    yb = c.head_block("Support at Home", [("Check personal care shows ", "up"), ("$0", "it")],
                      x0, sy, W if align == "center" else aw, base, 72, align=align, hero=True)
    c.para(b1, body_f, c.body_c, x0, yb, W if align == "center" else aw, align=align, lh_mul=1.3)
    c.para(b2, body_f, c.body_c, x0, yb + b1h + 20, W if align == "center" else aw, align=align, lh_mul=1.3)


def render_c(c):
    x0, y0, x1, y1 = c.frame()
    W = x1 - x0
    runs = [("The big number ", "up"), ("isn't the bill", "it")]
    if c.landscape:
        colw = int(W * 0.42)
        c.head_block("Statement Decoder", runs, x0, y0, colw, 66, 48)
        box = (x0 + colw + 44, y0, x1, y1)
        _summary_card(c, box) if c.v2 else _bars(c, (x0 + colw + 44, y0 + 8, x1, y1 - 8))
    else:
        yb = c.head_block("Statement Decoder", runs, x0, y0, W, 104, 70)
        gtop, gbot = yb + 18, y1 - 16
        if c.v2:
            _summary_card(c, (x0, gtop, x1, gbot))
        else:
            _bars(c, (x0, gtop + 6, x1, gbot - 6))


def render_d(c):
    x0, y0, x1, y1 = c.frame()
    W = x1 - x0
    runs = [("Ask about a charge ", "up"), ("before paying", "it")]
    if c.landscape:
        colw = int(W * 0.44)
        c.head_block("Invoice Checker", runs, x0, y0, colw, 62, 46)
        gx = x0 + colw + 44
        inv_h = int((y1 - y0) * 0.46)
        qt = _invoice_block(c, gx, y0, x1, inv_h)
        _questions(c, gx, qt + 28, x1, y1, grid=True)
    else:
        yb = c.head_block("Invoice Checker", runs, x0, y0, W, 92, 64)
        gtop, gbot = yb + 18, y1 - 16
        inv_h = int((gbot - gtop) * 0.34)
        qt = _invoice_block(c, x0, gtop, x1, inv_h)
        grid = (c.ratio == "1x1")
        _questions(c, x0, qt + (34 if not grid else 40), x1, gbot, grid=grid)


def render_e(c):
    x0, y0, x1, y1 = c.frame()
    W = x1 - x0
    align = "center" if (c.v2 and not c.landscape) else "left"
    aw = W if not c.landscape else int(W * 0.8)
    body_f = F("inter", c.sz["body"], 500)
    runs = [("Aged care, ", "up"), ("made clear", "it")]
    b1 = "Most aged care software is made for providers."
    b2 = "Wayly is made for the people reading the statement."
    small = "Built in Canberra"
    base = 92 if c.landscape else 150
    ww = W if align == "center" else aw
    ey_h = int(c.sz["eyebrow"] * 1.8)
    _, _, _, _, head_th, _, _ = c._rich(runs, base, ww)
    _, _, b1h = c.para_h(b1, body_f, ww)
    _, _, b2h = c.para_h(b2, body_f, ww)
    total = ey_h + min(head_th, int(base * 1.12 * 3.3)) + (10 + 46) + b1h + 12 + b2h + 52 + int(c.sz["body"] * 1.1)
    sy = y0 + max(0, ((y1 - y0) - total) // 2)
    yb = c.head_block("Aged care, decoded", runs, x0, sy, ww, base, 72, align=align, hero=True)
    c.para(b1, body_f, c.body_c, x0, yb, ww, align=align, lh_mul=1.3)
    c.para(b2, body_f, c.body_c, x0, yb + b1h + 12, ww, align=align, lh_mul=1.3)
    sfy = yb + b1h + 12 + b2h + 50
    sf = F("mono", c.sz["body"] - 12)
    if align == "center":
        tw = sum(c.tl(ch, sf) + max(2, int((c.sz["body"] - 12) * 0.14)) for ch in small)
        c.eyebrow(small, x0 + (W - tw) // 2, sfy, color=c.cta_c, size=c.sz["body"] - 12)
    else:
        c.eyebrow(small, x0, sfy, color=c.cta_c, size=c.sz["body"] - 12)


RENDERERS = {"a_decoder": render_a, "b_october_check": render_b, "c_big_number": render_c,
             "d_invoice_questions": render_d, "e_founder": render_e}


def build():
    manifest = []
    for slug in AD_SLUGS:
        folder = os.path.join(OUT, slug)
        os.makedirs(folder, exist_ok=True)
        for variant in ("v1", "v2"):
            for ratio, W, H in RATIOS:
                c = Canvas(W, H, ratio, variant)
                RENDERERS[slug](c)
                fname = f"wayly_meta_{slug}_{variant}_{ratio}_{W}x{H}.png"
                c.img.convert("RGB").save(os.path.join(folder, fname), "PNG", optimize=True)
                seen, uniq = set(), []
                for t in c.texts:
                    t = t.strip()
                    if t and t not in seen:
                        seen.add(t); uniq.append(t)
                manifest.append({"file_name": fname, "ad": slug, "variant": variant,
                                 "size": f"{ratio} {W}x{H}", "on_image_text": " | ".join(uniq)})
    review = os.path.join(OUT, "review")
    os.makedirs(review, exist_ok=True)
    with open(os.path.join(review, "manifest.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "ad", "variant", "size", "on_image_text"])
        w.writeheader()
        for r in manifest:
            w.writerow(r)
    print("rendered", len(manifest))
    return manifest


def contact_sheet(manifest):
    cols, cellW, cellH, pad_top = 8, 470, 540, 100
    rows = len(AD_SLUGS)
    sheet = Image.new("RGB", (cols * cellW, pad_top + rows * cellH), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    d.text((40, 32), "Wayly Meta ads  .  contact sheet  .  40 files", font=F("fraunces", 46, 560), fill=TEAL)
    cap = F("mono", 15)
    byad = {}
    for r in manifest:
        byad.setdefault(r["ad"], []).append(r)
    order, rord = {"v1": 0, "v2": 1}, {"1x1": 0, "4x5": 1, "9x16": 2, "191x1": 3}
    for ri, slug in enumerate(AD_SLUGS):
        files = sorted(byad[slug], key=lambda r: (order[r["variant"]], rord[r["size"].split()[0]]))
        for ci, r in enumerate(files):
            cx, cy = ci * cellW, pad_top + ri * cellH
            im = Image.open(os.path.join(OUT, slug, r["file_name"])).copy()
            im.thumbnail((cellW - 40, cellH - 84), Image.LANCZOS)
            ox = cx + (cellW - im.width) // 2
            oy = cy + (cellH - 84 - im.height) // 2 + 10
            sheet.paste(im, (ox, oy))
            d.rectangle([ox, oy, ox + im.width, oy + im.height], outline=(214, 222, 218), width=1)
            d.text((cx + 18, cy + cellH - 54), r["file_name"], font=cap, fill=(40, 60, 58))
    sheet.save(os.path.join(OUT, "review", "contact_sheet.png"), "PNG", optimize=True)
    print("contact sheet", sheet.size)


if __name__ == "__main__":
    m = build()
    contact_sheet(m)
