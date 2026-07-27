import {
    Box, Typography, TextField, MenuItem,
    Alert, Stack, Paper, Skeleton, Link, Divider,
} from "@mui/material";
import Grid from "@mui/material/Grid";

import ViewModuleIcon from "@mui/icons-material/ViewModule";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ListAltIcon from "@mui/icons-material/ListAlt";

import SectionCard from "@/shared/components/SectionCard";
import { QUICK_ACCESS_PERIODS, useAdminQuickAccess } from "../hooks/useAdminQuickAccess";
import AdminStatisticsSection from "./AdminStatisticsSection";

// Headline-counter accents drawn from the app theme (teal-led EcoPart palette)
// instead of the off-brand mockup colours, so the tab matches the rest of the app.
const STAT_COLORS = {
    projects: "primary.main",
    users: "secondary.main",
    exports: "info.main",
    tasks: "success.main",
} as const;

/** One brand-coloured headline counter (projects / users / exports / tasks). */
interface StatCardProps {
    label: string;
    value: number | null;
    loading: boolean;
    color: string;
    icon: React.ReactNode;
}

const StatCard = ({ label, value, loading, color, icon }: StatCardProps) => (
    <Paper
        elevation={0}
        sx={{
            backgroundColor: color,
            color: "common.white",
            borderRadius: 2,
            p: 2.5,
            height: "100%",
            minHeight: 140,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
        }}
    >
        <Box sx={{ "& svg": { fontSize: 30 } }}>{icon}</Box>
        <Box>
            {loading ? (
                <Skeleton variant="text" width={70} height={44} sx={{ bgcolor: "rgba(255,255,255,0.35)" }} />
            ) : (
                <Typography variant="h3" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                    {value ?? "—"}
                </Typography>
            )}
            <Typography variant="h6" component="div" sx={{ fontWeight: 400, mt: 0.5 }}>
                {label}
            </Typography>
        </Box>
    </Paper>
);

/** An external "useful link" from the mockup (opens in a new tab). */
const USEFUL_LINKS: { label: string; href: string }[] = [
    { label: "Docker administration", href: "https://hub.docker.com/r/ecotaxa/ecopart_front" },
    { label: "Specifications", href: "https://github.com/ecotaxa/ecopart_front#readme" },
];

/**
 * AdminQuickAccessTab — the "QUICK ACCESS" panel of the EcoPart administration page.
 *
 * Shows the four headline counters (projects, users, exports, tasks) scoped to a
 * selectable time window (`useAdminQuickAccess`), plus the admin shortcuts and the
 * useful external links from the mockup.
 */
export default function AdminQuickAccessTab() {
    const { stats, loading, error, period, setPeriod } = useAdminQuickAccess();

    return (
        <Box>
            {error && (
                <Box sx={{ mb: 2 }}>
                    <Alert severity="error" variant="outlined">
                        {error}
                    </Alert>
                </Box>
            )}

            {/* One big container for the whole tab, matching the project tabs'
                single-SectionCard architecture. */}
            <SectionCard>
                {/* HEADER + PERIOD SELECTOR */}
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 2,
                        mb: 3,
                    }}
                >
                    <Typography variant="h6">Quick access</Typography>
                    <TextField
                        select
                        size="small"
                        label="Period"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as typeof period)}
                        sx={{ minWidth: 200 }}
                    >
                        {QUICK_ACCESS_PERIODS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>

                {/* STAT CARDS */}
                <Grid container spacing={2.5} sx={{ mb: 5 }}>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <StatCard label="Projects" value={stats.projects} loading={loading} color={STAT_COLORS.projects} icon={<ViewModuleIcon />} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <StatCard label="Users" value={stats.users} loading={loading} color={STAT_COLORS.users} icon={<PeopleAltIcon />} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <StatCard label="Exports" value={stats.exports} loading={loading} color={STAT_COLORS.exports} icon={<CloudUploadIcon />} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <StatCard label="Tasks" value={stats.tasks} loading={loading} color={STAT_COLORS.tasks} icon={<ListAltIcon />} />
                    </Grid>
                </Grid>

                {/* USEFUL LINKS */}
                <Box>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Useful links:
                    </Typography>
                    <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                        {USEFUL_LINKS.map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                underline="hover"
                                color="primary"
                            >
                                {link.label}
                            </Link>
                        ))}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography component="span" variant="body2">
                                <span>GitHub repository </span>
                                <Link
                                    href="https://github.com/ecotaxa/ecopart_front"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    underline="hover"
                                    color="primary"
                                >
                                    <span>FRONT</span>
                                </Link>
                                <Typography component="span" variant="body2">
                                    <span> et </span>
                                </Typography>
                                <Link
                                    href="https://github.com/ecotaxa/ecopart_back"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    underline="hover"
                                    color="primary"
                                >
                                    <span>BACK</span>
                                </Link>
                            </Typography>

                        </Box>
                    </Stack>
                </Box>

                <Divider sx={{ my: 4 }} />

                {/* Full /admin/stats analytics dashboard, in the same container. */}
                <AdminStatisticsSection />
            </SectionCard>
        </Box>
    );
}
