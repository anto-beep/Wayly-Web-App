import React from "react";
import { SvgXml } from "react-native-svg";

// Official Wayly mark (from /branding/svg). Inlined so it ships with the app
// and can recolour for dark mode (mono-white variant).
const MARK_DEFAULT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#FBF8F3"/>
<path d="M 88 132 C 88 124, 96 116, 108 116 L 124 116 C 134 116, 142 122, 145 132 L 196 312 L 240 152 C 244 138, 254 130, 268 132 C 280 134, 290 142, 294 156 L 332 308 L 388 132 C 391 122, 400 116, 410 116 L 426 116 C 438 116, 446 124, 446 132" fill="none" stroke="#0E4D52" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="446" cy="132" r="22" fill="#A5512B"/></svg>`;

const MARK_WHITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<path d="M 88 132 C 88 124, 96 116, 108 116 L 124 116 C 134 116, 142 122, 145 132 L 196 312 L 240 152 C 244 138, 254 130, 268 132 C 280 134, 290 142, 294 156 L 332 308 L 388 132 C 391 122, 400 116, 410 116 L 426 116 C 438 116, 446 124, 446 132" fill="none" stroke="#FFFFFF" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="446" cy="132" r="22" fill="#FFFFFF"/></svg>`;

export function WaylyMark({ size = 28, white = false }: { size?: number; white?: boolean }) {
  return <SvgXml xml={white ? MARK_WHITE : MARK_DEFAULT} width={size} height={size} />;
}
