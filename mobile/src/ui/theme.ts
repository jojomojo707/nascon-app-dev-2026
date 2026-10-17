// Design tokens (one place) + tenant branding. Screens use only these values.
import { useAppStore } from "../state/appStore";

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 16 };
export const font = { small: 14, body: 16, title: 20, h1: 24, score: 44 };
export const TAP = 48; // minimum touch target (dp)

export const baseColors = {
  primary: "#1E3A8A",
  onPrimary: "#FFFFFF",
  secondary: "#0EA5E9",
  surface: "#FFFFFF",
  background: "#F3F4F6",
  onSurface: "#111827",
  muted: "#4B5563",
  border: "#D1D5DB",
  success: "#166534",
  successBg: "#DCFCE7",
  warning: "#92400E",
  warningBg: "#FEF3C7",
  danger: "#991B1B",
  dangerBg: "#FEE2E2",
  info: "#1E40AF",
  infoBg: "#DBEAFE",
  neutralBg: "#E5E7EB",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Black or white text, whichever has better contrast on `bg` (WCAG). */
export function onColor(bg: string): string {
  const rgb = hexToRgb(bg);
  if (!rgb) return "#FFFFFF";
  const L = luminance(rgb);
  const white = 1.05 / (L + 0.05);
  const black = (L + 0.05) / 0.05;
  return white >= black ? "#FFFFFF" : "#000000";
}

export function useColors() {
  const tenant = useAppStore((s) => s.session?.tenant);
  const primary = tenant?.primary_color && hexToRgb(tenant.primary_color) ? tenant.primary_color : baseColors.primary;
  const secondary = tenant?.secondary_color && hexToRgb(tenant.secondary_color) ? tenant.secondary_color : baseColors.secondary;
  return { ...baseColors, primary, secondary, onPrimary: onColor(primary) };
}
