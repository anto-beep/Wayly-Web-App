# Wayly Brand Kit

Everything you need to put the Wayly logo and favicon across the apps.

## Brand colours

| Use | Hex |
| --- | --- |
| Navy (primary) | `#1F3A5F` |
| Gold (accent)  | `#D4A24E` |
| Cream (surface) | `#FAF7F2` |

## File map

```
branding/
├── svg/                     ← masters, infinitely scalable, edit-friendly
│   ├── wayly-mark.svg                  navy square with gold heart + arc
│   ├── wayly-mark-light.svg            cream square with navy arc + gold heart
│   ├── wayly-mark-mono-navy.svg        single-colour navy on transparent
│   ├── wayly-mark-mono-white.svg       single-colour white on transparent
│   ├── wayly-wordmark-navy.svg         "Wayly" text only, navy
│   ├── wayly-wordmark-white.svg        "Wayly" text only, white
│   ├── wayly-lockup-navy.svg           mark + wordmark, navy
│   └── wayly-lockup-white.svg          mark + wordmark, white
│
├── png/                     ← exported at every common size
│   ├── wayly-mark-{16,32,48,64,96,128,180,192,256,384,512,1024}.png
│   ├── wayly-mark-light-{512,1024}.png
│   ├── wayly-mark-mono-navy-512.png
│   ├── wayly-mark-mono-white-512.png
│   ├── wayly-wordmark-navy-{512,1024,2048}.png
│   ├── wayly-wordmark-white-{512,1024,2048}.png
│   ├── wayly-lockup-navy-{512,1024,2048,4096}.png
│   └── wayly-lockup-white-{512,1024,2048,4096}.png
│
└── favicon/                 ← drop into any web project's /public folder
    ├── favicon.ico            16/32/48/64 multi-resolution
    ├── favicon-16.png
    ├── favicon-32.png
    ├── apple-touch-icon.png   180 px, iOS home-screen
    ├── icon-192.png           PWA manifest (Android)
    └── icon-512.png           PWA manifest (Android, splash)
```

## Where each file goes

### Web app or marketing site
| File | Where |
| --- | --- |
| `favicon/favicon.ico` | `/public/favicon.ico` |
| `favicon/favicon-16.png` + `favicon-32.png` | `/public/` (link rel=icon) |
| `favicon/apple-touch-icon.png` | `/public/apple-touch-icon.png` |
| `favicon/icon-192.png` + `icon-512.png` | `/public/` (manifest.json) |
| `svg/wayly-lockup-navy.svg` | header logo on light backgrounds |
| `svg/wayly-lockup-white.svg` | header logo on navy/dark backgrounds |

### Email signatures
Use `png/wayly-lockup-navy-512.png` at a max height of 40–60 px. PNG renders most reliably across Gmail, Outlook, Apple Mail.

### App stores (iOS / Android)
- iOS: export `png/wayly-mark-1024.png` (already correct dimensions, no transparency)
- Android adaptive: use `svg/wayly-mark.svg` as foreground, `#1F3A5F` as background

### Slack / Discord / Notion / Linear
Upload `png/wayly-mark-512.png` as the workspace icon. Use `png/wayly-mark-light-512.png` if the workspace has a dark accent system.

### Social profile pictures
Twitter / X, LinkedIn, Instagram, Facebook: `png/wayly-mark-512.png` (or 1024 for higher fidelity).

## Recommended HTML snippet

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#1F3A5F">
```

## Clear space and minimum size

- Keep a clear-space margin around the mark equal to **one-quarter of the mark's height** on all sides.
- Minimum print size of the mark: **12 mm / 0.5 inch** wide.
- Minimum digital size of the mark: **16 px** (the included `favicon-16` is hand-optimised for this).
- Do not stretch, recolour outside the brand palette, or place on busy photo backgrounds without an underlay.

## Download

The whole kit is also available as a single zip:

```
branding/wayly-brand-kit.zip
```
