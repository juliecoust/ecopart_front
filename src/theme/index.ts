import { createTheme } from "@mui/material/styles";
import type { TypographyStyle, TypographyVariantsOptions } from "@mui/material/styles";

import { palette, ecotaxaColors } from "./palette";
import { typography } from "./typography";
import { components } from "./components";

/** MUI's default `typography.fontSize`, from which it derives every variant it computes itself. */
const DEFAULT_FONT_SIZE = 14;

/** The only variants declaring an explicit `fontSize`; the rest are derived from `fontSize`. */
const SIZED_VARIANTS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/**
 * Enlarges (or shrinks) every text style by `scale`.
 *
 * MUI computes body/caption/button/… from `typography.fontSize`, so bumping that number carries
 * most of the work; the headings pin their own `rem` size and have to be multiplied by hand.
 */
const scaleTypography = (base: TypographyVariantsOptions, scale: number): TypographyVariantsOptions => {
    if (scale === 1) return base;

    const scaled: TypographyVariantsOptions = { ...base, fontSize: DEFAULT_FONT_SIZE * scale };
    for (const variant of SIZED_VARIANTS) {
        const style = base[variant] as TypographyStyle | undefined;
        const fontSize = style?.fontSize;
        if (typeof fontSize === "string" && fontSize.endsWith("rem")) {
            scaled[variant] = { ...style, fontSize: `${parseFloat(fontSize) * scale}rem` };
        }
    }
    return scaled;
};

/**
 * The EcoPart theme, optionally with all of its text scaled.
 *
 * `textScale` exists for screens that need to be read at a glance (the QC import modal), which wrap
 * their content in a `ThemeProvider` built here instead of hard-coding font sizes: everything —
 * including MUI X chart axis and tick labels, which come from `body1`/`caption` — grows together.
 */
export const createEcopartTheme = (textScale = 1) =>
    createTheme({
        palette,
        typography: scaleTypography(typography, textScale),
        components,
        shape: {
            borderRadius: 4,
        },
    });

export const theme = createEcopartTheme();

// Re-exported so brand colour scales are reachable from `sx` props where MUI's
// semantic palette is not enough (gradients, hover tints, …).
export { ecotaxaColors };
