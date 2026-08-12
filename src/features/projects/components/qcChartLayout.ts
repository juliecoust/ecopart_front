import { useTheme } from "@mui/material/styles";

/**
 * Layout metrics shared by a QC profile chart and by anything laid out next to it.
 *
 * Every chart is built from stacked slots of FIXED height — title, legend, then the plot — so that
 * charts sitting side by side line up exactly: same legend baseline, same plot top, same plot
 * bottom. Titles run one or two lines and only some charts carry a legend; without pinned slots
 * those differences shift each neighbouring chart by a different amount.
 *
 * The values are sized for MUI's default typography and scaled by `useTextScale()`, because the QC
 * modal renders with enlarged text: axis labels (`body1`), tick labels and legends (`caption`) all
 * come from the theme, so the space reserved for them has to grow with it.
 */
const BASE = {
    titleSlot: 40, // two lines of `caption`
    legendSlot: 28,
    xAxisHeight: 56,
    yAxisWidth: 64,
} as const;

/** MUI's default `typography.fontSize`; the yardstick for how enlarged the current theme's text is. */
const DEFAULT_FONT_SIZE = 14;

/** How much larger the surrounding theme's text is than the MUI default (1 = default). */
export const useTextScale = () => useTheme().typography.fontSize / DEFAULT_FONT_SIZE;

export interface QcChartMetrics {
    titleSlot: number;
    legendSlot: number;
    xAxisHeight: number;
    yAxisWidth: number;
}

/** The chart slot/axis sizes for the current theme's text size. */
export const useQcChartMetrics = (): QcChartMetrics => {
    const scale = useTextScale();
    return {
        titleSlot: Math.round(BASE.titleSlot * scale),
        legendSlot: Math.round(BASE.legendSlot * scale),
        xAxisHeight: Math.round(BASE.xAxisHeight * scale),
        yAxisWidth: Math.round(BASE.yAxisWidth * scale),
    };
};
