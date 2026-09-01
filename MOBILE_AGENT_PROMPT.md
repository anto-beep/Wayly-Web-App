# Mobile Agent Prompt — Wayly Capacitor App Brand Refresh

> **Building the full app, not just the brand refresh?** Use
> [`MOBILE_AGENT_DASHBOARD_PROMPT.md`](./MOBILE_AGENT_DASHBOARD_PROMPT.md)
> instead — it covers every module, route, API, billing flow and participant
> switching behavior in addition to the visual tokens below.

Copy everything below the `===` line and paste it into the mobile agent (or your own agent session that owns the Capacitor / React-Native mobile repo).

The mobile handoff bundle is committed to this repo at **three** locations, pick whichever your tooling can reach:

| Path | Use when |
|---|---|
| `/app/wayly-mobile-handoff.zip` | You have git/file access to the web repo root |
| `/app/docs/wayly-mobile-handoff.zip` | You prefer it kept with the rest of the docs |
| `/app/frontend/public/wayly-mobile-handoff.zip` | You want to download it over HTTPS from the live site (served at `<your-domain>/wayly-mobile-handoff.zip`) |

The unzipped contents already live at `/app/docs/mobile-handoff/` — open `README.md` there for the long-form installation guide.

===

You are updating the Wayly mobile app (Capacitor wrapper around the React web app, iOS + Android targets) to match the new **Feb 2026 brand refresh**. The web app has already shipped the new system. Your job is to bring the mobile build into parity.

## Inputs

Download or `cp` the handoff bundle:

- `wayly-mobile-handoff.zip` (~780 KB). Available at:
  - Repo root: `/app/wayly-mobile-handoff.zip`
  - Docs: `/app/docs/wayly-mobile-handoff.zip`
  - Live: `https://<wayly-domain>/wayly-mobile-handoff.zip`

Unzipped layout:

```
mobile-handoff/
├── branding/          # SVG logo variants (mark + lockup, light + dark)
├── icons/
│   ├── ios/           # 15 PNG sizes for Xcode AppIcon
│   └── android/       # 10 mipmap PNGs + play_store_512.png
└── fonts/             # Fraunces-Variable.ttf, Inter-VariableFont.ttf, IBMPlexMono-Regular.ttf
```

The README inside the bundle (`mobile-handoff/README.md`) has the full installation walkthrough — follow it as the authoritative source. The rest of this prompt is a quick-reference summary plus React-Native / Expo–specific notes in case your mobile shell isn't pure Capacitor.

## 1. Design tokens — exact values

These match `/app/frontend/tailwind.config.js` on the web side. Replace any old sky-blue / cyan / navy values you find in `colors.ts`, `theme.ts`, `tokens.json`, native splash JSON, etc.

### Brand colours

```ts
export const wayly = {
  teal: {
    50:  '#E9F2F2',
    100: '#C9E0E1',
    200: '#A3CBCC',
    300: '#6FAAAC',
    400: '#3D8488',
    500: '#1A696E',
    600: '#0E4D52',   // ← primary brand (was navy #0E2A47)
    700: '#0A3E42',
    800: '#072E31',
    900: '#041E20',
  },
  sage: {
    50:  '#EEF3EE',
    100: '#D6E3D7',
    200: '#B9CEBB',
    300: '#94B397',
    400: '#6B8F71',
    500: '#54775A',
    600: '#425F47',   // body-safe secondary
    700: '#344C39',
    800: '#26382A',
    900: '#18241B',
  },
  clay: {
    50:  '#FBEEE7',
    100: '#F4D6C5',
    200: '#EBB89E',
    300: '#DD9069',
    400: '#C2683D',
    500: '#A5512B',   // ← accent / CTA (replaces cyan)
    600: '#874021',
    700: '#6A3219',
    800: '#4D2412',
    900: '#31170B',
  },
  neutral: {
    0:   '#FFFFFF',
    50:  '#FBF8F3',   // warm off-white app background
    100: '#F4EFE7',
    200: '#E7E0D5',
    300: '#D3C9BB',
    400: '#B3A899',
    500: '#8C8275',
    600: '#6E6559',
    700: '#524B42',   // body copy
    800: '#37322C',
    850: '#28241F',
    900: '#1C2B2D',   // headlines
  },
  // Functional
  success: '#0F5648',
  warning: '#A5512B',
  error:   '#C0392B',
};

export const semantic = {
  appBackground: wayly.neutral[50],     // #FBF8F3
  surface:       wayly.neutral[0],      // #FFFFFF
  surfaceAlt:    wayly.neutral[100],    // #F4EFE7
  textPrimary:   wayly.neutral[900],    // #1C2B2D
  textSecondary: wayly.neutral[700],    // #524B42
  textOnDark:    '#FFFFFF',
  border:        wayly.neutral[200],    // #E7E0D5
  brand:         wayly.teal[600],       // #0E4D52
  accent:        wayly.clay[500],       // #A5512B
  cta:           wayly.clay[500],
  ctaHover:      wayly.clay[600],
};
```

### Typography

```ts
export const fonts = {
  heading: 'Fraunces',         // serif, variable (100–900). Tracking: -0.5%
  body:    'Inter',            // sans, variable (100–900). Tracking: 0
  mono:    'IBM Plex Mono',    // for $ amounts, budgets, statement IDs. tabular-nums on.
};
```

Type scale (mobile — round web rems × 16):

| Token | Size | Line height | Weight |
|---|---|---|---|
| display | 40 | 44 | 600 (Fraunces) |
| h1 | 32 | 38 | 600 (Fraunces) |
| h2 | 24 | 30 | 600 (Fraunces) |
| h3 | 20 | 26 | 600 (Fraunces) |
| body-lg | 17 | 26 | 400 (Inter) |
| body | 15 | 22 | 400 (Inter) |
| body-sm | 13 | 18 | 400 (Inter) |
| caption | 11 | 14 | 500 (Inter, uppercase, letter-spacing +0.6) |
| mono-lg | 17 | 22 | 500 (IBM Plex Mono, tabular-nums) |
| mono | 15 | 20 | 500 (IBM Plex Mono, tabular-nums) |

### Radius / spacing

- Radius: card 16, input 10, pill 9999
- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- Shadow (cards): `0 8px 24px -12px rgba(28, 43, 45, 0.18)`

## 2. Logos & app icons

Replace every existing logo reference (PNG, SVG, vector asset) with the corresponding file from `mobile-handoff/branding/`:

- `wayly-mark.svg` — primary mark on warm tile (default in light contexts)
- `wayly-mark-light.svg` — primary mark on teal tile (use on dark / brand-coloured sections)
- `wayly-mark-mono-white.svg` — white mark for use over photography or coloured headers
- `wayly-lockup-navy.svg` — full logo + wordmark for splash, marketing tiles, header on launch screen
- `wayly-lockup-white.svg` — warm tile variant

**iOS app icon**: drag every PNG in `mobile-handoff/icons/ios/` into `Assets.xcassets → AppIcon`, matching by filename (e.g., `Icon-60@2x.png` → 60pt 2x slot). The 1024×1024 `Icon-1024.png` is the App Store marketing tile.

**Android app icon**: copy each `ic_launcher_*.png` and `ic_launcher_round_*.png` into the corresponding `android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/` folder as `ic_launcher.png` and `ic_launcher_round.png`. Upload `play_store_512.png` to the Play Console listing.

Optional automation:

```bash
yarn add -D @capacitor/assets
cp mobile-handoff/icons/ios/Icon-1024.png assets/icon.png
npx capacitor-assets generate
```

## 3. Fonts — bundle them (do not rely on CDN at launch)

Total weight: ~800 KB. Recommended over a Google-Fonts CDN fetch.

### iOS

1. Drag `Fraunces-Variable.ttf`, `Inter-VariableFont.ttf`, `IBMPlexMono-Regular.ttf` from `mobile-handoff/fonts/` into the Xcode project (group: `Resources/Fonts/`). Tick **Copy items if needed** + add to the **App** target.
2. In `Info.plist` add:

   ```xml
   <key>UIAppFonts</key>
   <array>
       <string>Fraunces-Variable.ttf</string>
       <string>Inter-VariableFont.ttf</string>
       <string>IBMPlexMono-Regular.ttf</string>
   </array>
   ```

### Android

```bash
mkdir -p android/app/src/main/assets/fonts
cp mobile-handoff/fonts/*.ttf android/app/src/main/assets/fonts/
```

Then in mobile CSS / a mobile-only stylesheet:

```css
@font-face {
  font-family: 'Fraunces';
  src: url('/android_asset/fonts/Fraunces-Variable.ttf') format('truetype-variations'),
       local('Fraunces');
  font-weight: 100 900;
  font-display: block;
}
@font-face {
  font-family: 'Inter';
  src: url('/android_asset/fonts/Inter-VariableFont.ttf') format('truetype-variations'),
       local('Inter');
  font-weight: 100 900;
  font-display: block;
}
@font-face {
  font-family: 'IBM Plex Mono';
  src: url('/android_asset/fonts/IBMPlexMono-Regular.ttf') format('truetype'),
       local('IBM Plex Mono');
  font-weight: 400;
  font-display: block;
}
```

### Expo / React Native

```ts
import * as Font from 'expo-font';
await Font.loadAsync({
  'Fraunces':        require('./assets/fonts/Fraunces-Variable.ttf'),
  'Inter':           require('./assets/fonts/Inter-VariableFont.ttf'),
  'IBM Plex Mono':   require('./assets/fonts/IBMPlexMono-Regular.ttf'),
});
```

## 4. Splash screen + status bar

Edit `capacitor.config.ts`:

```ts
const config: CapacitorConfig = {
  // ...
  plugins: {
    SplashScreen: {
      backgroundColor: '#FBF8F3',   // warm off-white
      launchAutoHide: false,
      launchShowDuration: 1200,
    },
    StatusBar: {
      backgroundColor: '#0E4D52',   // teal-ink primary
      style: 'LIGHT',               // white text on dark bar
    },
  },
};
```

Generate splash assets:

```bash
# Render the lockup onto a 2732×2732 warm tile
python3 -c "
import cairosvg
cairosvg.svg2png(
  url='mobile-handoff/branding/wayly-lockup-navy.svg',
  write_to='assets/splash.png',
  output_width=2732, output_height=2732,
  background_color='#FBF8F3',
)"
npx capacitor-assets generate
```

For React Native: drop the same 2732×2732 PNG at `assets/splash.png` and update `app.json`:

```json
{
  "expo": {
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FBF8F3"
    },
    "ios":     { "backgroundColor": "#FBF8F3" },
    "android": { "backgroundColor": "#FBF8F3" }
  }
}
```

## 5. Screen-by-screen styling notes

Apply these globally — every screen inherits unless overridden.

### App shell

- `SafeAreaView` background → `#FBF8F3` (warm off-white).
- Bottom tab bar background → `#FFFFFF`, top border `1px solid #E7E0D5`, active tab tint `#0E4D52` (teal-600), inactive `#8C8275` (neutral-500), active icon weight bumped (use `lucide-react-native` filled or stroke-2).
- Header background → `#0E4D52` (teal-600). Title in Fraunces 18, white. Right action icons white 24px stroke 1.5.

### Cards

- Background `#FFFFFF`, radius 16, padding 20, shadow `0 8px 24px -12px rgba(28,43,45,0.18)`.
- Card header (e.g., "Recent statement") → Inter 600 / 15 / `#1C2B2D`.
- Card body copy → Inter 400 / 15 / `#524B42`.
- $ amounts → IBM Plex Mono 500 with `font-variant-numeric: tabular-nums`. Use `#0F5648` for positive remaining balance; `#A5512B` for spent / clay accent; `#1C2B2D` for neutral totals.

### Buttons

- Primary CTA → background `#A5512B` (clay-500), text white, weight 600, radius 9999 (pill), height 48, horizontal padding 24. Pressed state: `#874021`.
- Secondary → background white, border `1.5px solid #0E4D52`, text `#0E4D52`, radius 9999. Pressed: background `#E9F2F2`.
- Tertiary / text-only → text `#0E4D52`, weight 600, no border.
- Destructive → background `#C0392B`, text white.

### Inputs

- Background `#FFFFFF`, border `1px solid #E7E0D5`, radius 10, padding 12 × 14. Focus: border `#0E4D52`, ring `0 0 0 3px rgba(14,77,82,0.15)`.
- Label → caption (11 / 600 / uppercase / letter-spacing +0.6 / `#524B42`).
- Helper / error → 13 / 400 / `#524B42` or `#C0392B`.

### Lists / rows

- Background white, border-bottom `1px solid #F4EFE7`, padding 16. Tap state: `#F4EFE7` (neutral-100).
- Leading avatar/icon circle 40, background `#E9F2F2` (teal-50), foreground `#0E4D52`.

### Empty / placeholder states

- Background `#FBF8F3`, illustration centered, body copy Inter 15 / `#524B42`. Primary action is a pill CTA in clay-500.

### Charts (budget bars, donuts, sparklines)

- Personal Care / primary spend → `#0E4D52`
- Domestic Assistance / secondary spend → `#6B8F71` (sage-400)
- Transport / tertiary spend → `#A5512B` (clay-500)
- Track / unfilled portion → `#E2EEF8` if a chart already uses it, otherwise `#F4EFE7` (neutral-100).
- Donut gradient: stop 0 `#0E4D52` → stop 100 `#3D8488`.

### Modals / sheets

- Sheet handle pill → `#D3C9BB` (neutral-300), 4×40, centred top.
- Background white, top corners 24, padding 24. Title Fraunces 22 / 600 / `#1C2B2D`.

## 6. Sweep checklist before submitting builds

- [ ] All `#0E2A47` (old navy) references swapped for `#0E4D52` (teal-600)
- [ ] All `#22C5BE` / `#0BA5A0` cyan references swapped for `#A5512B` clay
- [ ] All `Inter`-only headings → `Fraunces` (search for `font-family:` and `fontFamily:`)
- [ ] All `$` amounts wrap in mono + tabular-nums (search regex: `\$\d`)
- [ ] App icon updated on home screen — clean install, not just upgrade
- [ ] Splash → warm off-white tile + teal lockup, no white flash
- [ ] Status bar reads teal with white text on Android and iOS
- [ ] Bottom tab bar → white, active tint teal
- [ ] `meta name="theme-color"` (if your webview reads it) → `#0E4D52`
- [ ] No leftover gradient backgrounds with the old sky-blue palette
- [ ] App Store + Play Store screenshots regenerated with new palette

## 7. Verification

After running on a real device:

1. Cold launch with Wi-Fi off → fonts must still render in Fraunces / Inter (proves they're bundled, not CDN-fetched).
2. Open every primary tab → background warm off-white, no leftover pure-white #FFFFFF gradient hero.
3. Tap a CTA → ripple / pressed state animates to clay-600 within 150ms.
4. Open a budget card → $ amounts render in IBM Plex Mono with aligned decimal points.
5. Trigger an error toast → background `#C0392B`, text white, Inter 500 / 15.

If anything looks off, post a screenshot back to the human and they'll send the exact token to fix.

---

When you're done, commit with the message:

```
feat(brand): refresh mobile to Wayly Feb 2026 system (teal-ink / sage / clay + Fraunces)
```

and run a smoke build on both targets:

```bash
npx cap sync ios && npx cap open ios
npx cap sync android && npx cap open android
# or for Expo:
eas build --profile preview --platform all
```
