import React, { createContext, useContext, useMemo } from "react";

import { PALETTES, type Palette, type Scheme } from "../constants/theme";

type Theme = { scheme: Scheme; colors: Palette };

const ThemeContext = createContext<Theme>({ scheme: "dark", colors: PALETTES.dark });

/** Patients get the dark palette, caregivers the light one. */
export function ThemeProvider({ scheme, children }: { scheme: Scheme; children: React.ReactNode }) {
  const value = useMemo(() => ({ scheme, colors: PALETTES[scheme] }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Themed StyleSheet:
 *   const useStyles = makeStyles((c) => StyleSheet.create({ ... }));
 *   const styles = useStyles();
 */
export function makeStyles<T>(factory: (colors: Palette) => T) {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => factory(colors), [colors]);
  };
}
