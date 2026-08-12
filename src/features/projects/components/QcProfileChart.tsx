import React from "react";
import { Box, Typography } from "@mui/material";
import { ScatterChart, scatterClasses } from "@mui/x-charts/ScatterChart";
import { useXScale, useYScale } from "@mui/x-charts/hooks";

import { QcAxisScale } from "../api/projects.api";
import { useQcChartMetrics } from "./qcChartLayout";

/**
 * A single plotted series. `y` is always DEPTH in metres (the shared vertical axis of every QC
 * profile); `x` is the value being profiled — image index for the pressure graph, imaged volume or
 * particle counts for the binned graphs.
 */
export interface QcChartSeries {
    label: string;
    color: string;
    points: { x: number; y: number }[];
}

interface QcProfileChartProps {
    title: string;
    series: QcChartSeries[];
    xLabel: string;
    yLabel?: string;
    /** X-axis rendering; depth (Y) is always linear and reversed (shallow on top). */
    xScale?: QcAxisScale;
    /** Height of the plot itself; the title and legend slots sit on top of it. */
    height?: number;
    /** Fills the legend slot above the plot with one entry per series. */
    showLegend?: boolean;
    /**
     * Keeps the (possibly empty) legend slot so this chart aligns with legend-carrying neighbours.
     * Set to `false` for a chart that stands alone in its row, to lift it by the slot's height.
     */
    reserveLegendSlot?: boolean;
    /**
     * `"points"` plots one marker per data point; `"line"` connects them into a continuous curve
     * (markers kept invisible so hovering still reaches the tooltip). Binned profiles read better
     * as a line — one value per depth bin — while the per-image pressure profile stays as points.
     */
    variant?: "points" | "line";
}

/** A series once mapped to chart coordinates — what both the markers and the polyline consume. */
interface PlottedSeries {
    id: string;
    color: string;
    data: { x: number; y: number }[];
}

/**
 * Draws each series as a polyline in the chart's own coordinate system. MUI X has no vertical
 * LineChart (its lines always run left-to-right, and here depth must be the Y axis), so the curve
 * is built by hand from the axis scales and rendered as a child of the ScatterChart surface.
 */
const ProfilePolylines: React.FC<{ series: PlottedSeries[] }> = ({ series }) => {
    // Linear and log X axes are both continuous d3 scales with the same (value) => position call
    // signature, so a single type argument covers either scaleType.
    const xScale = useXScale<"linear">();
    const yScale = useYScale<"linear">();

    return (
        <g>
            {series.map((s) => {
                // Sort by depth so the line follows the water column rather than the input order.
                const d = [...s.data]
                    .sort((a, b) => a.y - b.y)
                    .map((p) => [xScale(p.x), yScale(p.y)] as const)
                    .filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py))
                    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${px},${py}`)
                    .join(" ");
                if (d === "") return null;
                return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={1.5} />;
            })}
        </g>
    );
};

/**
 * Vertical oceanographic profile rendered with MUI X ScatterChart: depth on a reversed Y axis
 * (shallow at the top, like a real water column) and the measured value on X. Scatter (rather than
 * a line) is used because MUI X line charts can't run vertically and the profiles are non-monotonic
 * in depth; with hundreds of closely spaced points the markers read as a continuous curve.
 */
export const QcProfileChart: React.FC<QcProfileChartProps> = ({
    title, series, xLabel, yLabel = "depth (m)", xScale = "linear", height = 420, showLegend = false,
    reserveLegendSlot = true, variant = "points",
}) => {
    const metrics = useQcChartMetrics();

    // Log X can't plot 0/negative counts; only switch to log when there is something positive to show,
    // and drop the non-positive points so the scale stays valid.
    const anyPositive = series.some((s) => s.points.some((p) => p.x > 0));
    const scaleType: QcAxisScale = xScale === "log" && anyPositive ? "log" : "linear";
    const clampNonPositive = scaleType === "log";

    // Drop series that end up empty (e.g. an all-zero pixel class under a log scale): MUI X Charts
    // builds a spatial index per series and throws on a series with zero points.
    const scatterSeries = series
        .map((s, si) => ({
            id: `s${si}`,
            label: s.label,
            color: s.color,
            markerSize: 2,
            data: (clampNonPositive ? s.points.filter((p) => p.x > 0) : s.points)
                .map((p, pi) => ({ x: p.x, y: p.y, id: pi })),
        }))
        .filter((s) => s.data.length > 0);

    const hasData = scatterSeries.length > 0;

    return (
        <Box>
            <Typography
                variant="caption"
                color="text.secondary"
                title={title}
                sx={{
                    // Clamped to two lines inside a fixed slot: one- and two-line titles then push
                    // what follows down by exactly the same amount.
                    height: metrics.titleSlot,
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                }}
            >
                {title}
            </Typography>

            {/*
              * Own legend instead of MUI's: MUI inserts its legend as an extra grid row *above* the
              * <svg>, so a chart with a legend has its whole plot pushed down relative to a chart
              * without one. Rendering it here — in a slot that is kept even when empty, unless the
              * chart is alone in its row — keeps every plot area on the same top and bottom line.
              */}
            {(showLegend || reserveLegendSlot) && (
                <Box sx={{ height: metrics.legendSlot, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, overflow: "hidden" }}>
                    {showLegend && scatterSeries.map((s) => (
                        <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: s.color, flexShrink: 0 }} />
                            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                        </Box>
                    ))}
                </Box>
            )}

            {!hasData ? (
                <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="caption" color="text.secondary">No data</Typography>
                </Box>
            ) : (
                <ScatterChart
                    height={height}
                    series={scatterSeries}
                    // In line mode the markers stay in the DOM (they carry the hover/tooltip target
                    // and the axis domains) but are painted transparent, so only the curve shows.
                    sx={variant === "line" ? { [`.${scatterClasses.marker}`]: { opacity: 0 } } : undefined}
                    // `height`/`width` reserve room for the axis TITLE *plus* a line
                    // of tick labels. Without an explicit size MUI can auto-size the
                    // axis too small, and since these axes carry a title it then has
                    // no room left for the tick labels and blanks them entirely
                    // (empty text under every tick). These sizes keep both visible.
                    // Being identical on every chart, they also line up the plot
                    // bottoms and the x-axis titles across a row.
                    xAxis={[{ label: xLabel, scaleType, height: metrics.xAxisHeight }]}
                    yAxis={[{ label: yLabel, reverse: true, width: metrics.yAxisWidth }]}
                    // The legend is drawn above, outside the chart (see the legend slot).
                    hideLegend
                    disableVoronoi
                    grid={{ horizontal: true, vertical: true }}
                    margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
                >
                    {variant === "line" && <ProfilePolylines series={scatterSeries} />}
                </ScatterChart>
            )}
        </Box>
    );
};
