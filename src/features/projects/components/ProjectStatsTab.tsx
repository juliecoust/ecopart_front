import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import CloudIcon from "@mui/icons-material/Cloud";

import SectionCard from "@/shared/components/SectionCard";
import { ecotaxaColors } from "@/theme";

interface StatsInfoRowProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
}

const StatsInfoRow: React.FC<StatsInfoRowProps> = ({ icon, title, description, actionLabel, onAction }) => (
    <Box
        sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            p: 2.5,
            border: "1px solid",
            borderColor: ecotaxaColors.stone[200],
            borderRadius: 1,
        }}
    >
        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ color: "primary.main", display: "flex", mt: 0.5 }}>{icon}</Box>
            <Box>
                <Typography variant="body1">{title}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {description}
                </Typography>
            </Box>
        </Stack>
        <Button variant="outlined" color="primary" onClick={onAction} sx={{ flexShrink: 0, fontWeight: "bold" }}>
            {actionLabel}
        </Button>
    </Box>
);

interface ProjectStatsTabProps {
    onImportData: () => void;
    onLinkProject: () => void;
}

export const ProjectStatsTab: React.FC<ProjectStatsTabProps> = ({ onImportData, onLinkProject }) => {
    return (
        <SectionCard>
            <Stack spacing={2}>
                <StatsInfoRow
                    icon={<DownloadIcon />}
                    title="Your project is empty. You can now import data."
                    description="You can import UVP data, and particles data in the import tab of your project."
                    actionLabel="IMPORT DATA"
                    onAction={onImportData}
                />
                <StatsInfoRow
                    icon={<CloudIcon />}
                    title="Your project is not linked to an EcoTaxa project. Please link it to an existing or new EcoTaxa project."
                    description="You will then be able to import images to EcoTaxa from EcoPart and classify them in EcoTaxa."
                    actionLabel="LINK PROJECT"
                    onAction={onLinkProject}
                />
            </Stack>
        </SectionCard>
    );
};
