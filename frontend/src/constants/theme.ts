import type { TextStyle } from "react-native";

/**
 * Two palettes from the Figma redesign (SafeStep – UI exploration):
 * - dark: patients (low / no vision). Warm charcoal, cream cards, one coral accent.
 * - light: caregivers. Warm cream background, white cards.
 * Flat colours only, no gradients.
 */
const dark = {
  background: "#1A1917",
  surface: "#2B2926",
  surfaceAlt: "#36332F",
  text: "#FFFFFF",
  muted: "#B3ADA6",
  border: "#3A3733",

  // Cream cards with dark text: the highest-contrast thing on the screen
  card: "#F4EFEA",
  onCard: "#1C1B1F",

  primary: "#F4EFEA",
  onPrimary: "#1C1B1F",

  accent: "#F2704F",
  onAccent: "#1C1B1F",

  success: "#9FE0B4",
  successSurface: "#22301F",
  danger: "#FF8A6E",
  dangerSurface: "#3A2620",
};

export type Palette = typeof dark;

const light: Palette = {
  background: "#F4EFEA",
  surface: "#FFFFFF",
  surfaceAlt: "#EDE6DF",
  text: "#1C1B1F",
  muted: "#7B746E",
  border: "#EDE6DF",

  card: "#FFFFFF",
  onCard: "#1C1B1F",

  primary: "#1C1B1F",
  onPrimary: "#FFFFFF",

  accent: "#F2704F",
  onAccent: "#1C1B1F",

  success: "#3D8C5C",
  successSurface: "#E1F0E6",
  danger: "#D9503A",
  dangerSurface: "#FCE3DB",
};

export const PALETTES = { dark, light };
export type Scheme = keyof typeof PALETTES;

/** Plus Jakarta Sans, loaded in App.tsx. Use the family, not fontWeight. */
export const FONTS = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
};

/** Text styles (match the Figma text styles). They still grow with the phone's text size. */
export const TYPE = {
  headingXL: { fontFamily: FONTS.bold, fontSize: 36, lineHeight: 42, letterSpacing: -1.2 },
  headingL: { fontFamily: FONTS.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  headingM: { fontFamily: FONTS.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  titleL: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  titleM: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  bodyL: { fontFamily: FONTS.regular, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  bodyM: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 16 },
  stat: { fontFamily: FONTS.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -1 },
} satisfies Record<string, TextStyle>;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
};
