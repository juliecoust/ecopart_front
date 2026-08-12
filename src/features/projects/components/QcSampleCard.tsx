import React from "react";
import { Box, Typography, Button, TextField } from "@mui/material";
import Grid from "@mui/material/Grid";

import { ecotaxaColors } from "@/theme";
import SectionCard from "@/shared/components/SectionCard";
import { QcBinnedDepthProfile, SampleQcGraphs } from "../api/projects.api";
import { QcChartSeries, QcProfileChart } from "./QcProfileChart";
import { useQcChartMetrics } from "./qcChartLayout";

// Shades of blue for the pixel-class series (graphs "for 1, 2 and 3 pixels"):
// light → medium → dark, so the three curves stay distinguishable.
const PIXEL_COLORS = [ecotaxaColors.mainblue[400], ecotaxaColors.mainblue[600], ecotaxaColors.mainblue[800]];

// Every graph of the card — the pressure profile and the binned ones below it — shares one height
// and one column width, so they all line up instead of drifting.
const CHART_HEIGHT = 420;
/** Gutter (theme units) around the graphs on md+ — the breathing room asked for after each graph. */
const GRID_SPACING_MD = 8;
/**
 * Extra space to the RIGHT of the pressure graph, taken from the metadata column rather than added
 * as padding on the graph's own cell — padding there would eat into the plot and shrink it.
 */
const AFTER_CHART_MARGIN_SX = { pl: { md: 4 } };

/** Map a backend binned profile into chart series (x = value, y = depth). */
const toSeries = (profile: QcBinnedDepthProfile): QcChartSeries[] =>
    profile.series.map((s, i) => ({
        label: s.label,
        color: PIXEL_COLORS[i % PIXEL_COLORS.length],
        points: s.points.map((p) => ({ x: p.value, y: p.depth_m })),
    }));

interface QcSampleCardProps {
    sample: SampleQcGraphs;
    onRemove: (sampleName: string) => void;
    removeDisabled?: boolean;
}

export const QcSampleCard: React.FC<QcSampleCardProps> = ({ sample, onRemove, removeDisabled }) => {
    const { image_filtering: filtering, image_depth_profile: depthProfile } = sample;
    const chartMetrics = useQcChartMetrics();

    // Graph 1 shows every image, but splits them by `is_selected`: images kept by the
    // first/last + descent filters are blue, the discarded ones red (as in the mockup).
    // Both are plotted so the operator can see what the filtering removed.
    const pressurePoints = depthProfile.points.map((p) => ({ x: p.image_index, y: p.depth_m, kept: p.is_selected }));
    const pressureSeries: QcChartSeries[] = [
        {
            label: "kept images",
            color: ecotaxaColors.mainblue[500],
            points: pressurePoints.filter((p) => p.kept),
        },
        {
            label: "removed images",
            color: ecotaxaColors.danger[500],
            points: pressurePoints.filter((p) => !p.kept),
        },
    ];

    const removedPct = Math.round(filtering.removed_images.percent);

    // Bottom-row profile charts. The "black" profile only exists for instruments with dark frames —
    // when absent, its chart is omitted entirely (no placeholder) and the two that remain simply
    // share the row, which is what `chartCols` below is derived from.
    const profileCharts = [
        {
            key: "imaged-volume",
            title: "Vertical profile of imaged volume",
            series: toSeries(sample.imaged_volume_profile),
            xLabel: "imaged volume (L)",
            xScale: sample.imaged_volume_profile.suggested_scale,
            showLegend: false,
        },
        ...(sample.black_profile ? [{
            key: "black",
            title: "Vertical profile of black for 1, 2 and 3 pixels versus pressure",
            series: toSeries(sample.black_profile),
            xLabel: "count",
            xScale: sample.black_profile.suggested_scale,
            showLegend: true,
        }] : []),
        {
            key: "particle-lpm",
            title: "Vertical profile of particle (LPM) for 1, 2 and 3 pixels versus pressure",
            series: toSeries(sample.particle_lpm_profile),
            xLabel: "count",
            xScale: sample.particle_lpm_profile.suggested_scale,
            showLegend: true,
        },
    ];

    /*
     * ONE column width for EVERY graph of the card, chosen so the bottom row fills it: three binned
     * profiles → 4 columns each, two (no black profile) → 6 columns each. The pressure graph takes
     * the same width and the metadata block gets what is left, so whatever the instrument provides,
     * all the graphs come out identical and land on the same column edges.
     */
    const chartCols = profileCharts.length <= 2 ? 6 : 4;

    return (
        <SectionCard sx={{ mb: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold">Sample : {sample.sample_name}</Typography>
                <Button
                    onClick={() => onRemove(sample.sample_name)}
                    disabled={removeDisabled}
                    color="error"
                    sx={{ fontWeight: "bold" }}
                    size="small"
                >
                    REMOVE FROM IMPORT
                </Button>
            </Box>

            {/*
              * ONE grid for the whole card. Every graph is a cell of the same 12-column track, so
              * they are all exactly `chartCols` wide and cannot drift apart — which is what a second
              * container carrying its own spacing would eventually allow. The first row is
              * graph + metadata (a full 12 columns) and the binned graphs wrap onto the next row,
              * landing on the same column edges as the graph above them.
              */}
            <Grid container columnSpacing={{ xs: 4, md: GRID_SPACING_MD }} rowSpacing={{ xs: 4, md: GRID_SPACING_MD }}>
                <Grid size={{ xs: 12, md: chartCols }}>
                    <QcProfileChart
                        title="Vertical profile of the pressure of each image"
                        series={pressureSeries}
                        xLabel="image index"
                        yLabel="depth (m)"
                        height={CHART_HEIGHT}
                        // Alone in its row: no legend slot to reserve, so the graph sits higher.
                        reserveLegendSlot={false}
                    />
                </Grid>
                {/*
                  * Pushed down by the height of the graph's title slot so the metadata blocks start
                  * level with the plot area next to them rather than with its caption, and indented
                  * to widen the margin on the graph's right.
                  */}
                <Grid size={{ xs: 12, md: 12 - chartCols }} sx={{ pt: { md: `${chartMetrics.titleSlot}px` }, ...AFTER_CHART_MARGIN_SX }}>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2 }}>
                        UVP image selection (original full frame)
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6 }}>
                            <TextField fullWidth label="First image" value={filtering.first_image ?? "—"} size="small" InputProps={{ readOnly: true }} />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <TextField fullWidth label="Last image" value={filtering.last_image ?? "—"} size="small" InputProps={{ readOnly: true }} />
                        </Grid>
                    </Grid>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        <strong>firstimage</strong> / <strong>endimg</strong> from the sample header : values selected in
                        zooprocess or uvpapp by the operator to define the sample from the sequence.
                    </Typography>

                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 3, mb: 2 }}>
                        Descending filter results
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6 }}>
                            <TextField fullWidth label="Last used" value={filtering.last_image_used ?? "—"} size="small" InputProps={{ readOnly: true }} helperText="Last image used after descendent filter (depth profiles only)" />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <TextField fullWidth label="Removed images" value={`${filtering.removed_images.count} / ${removedPct}%`} size="small" InputProps={{ readOnly: true }} helperText="Between first and last image in number/percent" />
                        </Grid>
                    </Grid>
                </Grid>

                {profileCharts.map((c) => (
                    <Grid key={c.key} size={{ xs: 12, md: chartCols }}>
                        <QcProfileChart
                            title={c.title}
                            series={c.series}
                            xLabel={c.xLabel}
                            xScale={c.xScale}
                            height={CHART_HEIGHT}
                            showLegend={c.showLegend}
                            // Binned profiles carry one value per depth bin, so they read as a
                            // continuous curve (requested by the backend team for these three).
                            variant="line"
                        />
                    </Grid>
                ))}
            </Grid>
        </SectionCard>
    );
};
