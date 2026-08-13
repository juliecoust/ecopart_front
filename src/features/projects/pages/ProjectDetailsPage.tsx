import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import {
    Box,
    Container,
    Typography,
    Button,
    Tabs,
    Tab,
} from "@mui/material";
import MainLayout from "@/app/layouts/MainLayout";
import SectionCard from "@/shared/components/SectionCard";

// Import your tabs
import { ProjectMetadataTab } from "../components/ProjectMetadataTab";
import { ProjectSecurityTab } from "../components/ProjectSecurityTab";

import { ProjectBackupTab } from "../components/ProjectBackupTab";
import { ProjectImportTab } from "../components/ProjectImportTab";
import { ProjectTasksTab } from "../components/ProjectTasksTab";
import { ProjectStatsTab } from "../components/ProjectStatsTab";
import { getProjectById } from "../api/projects.api";

// Icons based on your mockup
import BarChartIcon from "@mui/icons-material/BarChart";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import CloudIcon from "@mui/icons-material/Cloud";
import DownloadIcon from "@mui/icons-material/Download";
import SyncIcon from "@mui/icons-material/Sync";
import LockIcon from "@mui/icons-material/Lock";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BackupIcon from "@mui/icons-material/Backup";
import { ProjectDataTab } from "../components/ProjectDataTab";

export default function ProjectDetailsPage() {
    const { id, tabName } = useParams<{ id: string; tabName?: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const tabDefinitions = useMemo(() => ([
        { slug: "stats", label: "STATS" },
        { slug: "metadata", label: "METADATA" },
        { slug: "data", label: "DATA" },
        { slug: "import", label: "IMPORT" },
        { slug: "update", label: "UPDATE" },
        { slug: "security", label: "SECURITY" },
        { slug: "tasks", label: "TASKS" },
        { slug: "backup", label: "BACKUP" },
    ]), []);

    const clampTabIndex = (value: unknown, fallback: number) => {
        if (typeof value !== "number" || !Number.isInteger(value)) {
            return fallback;
        }

        return Math.min(Math.max(value, 0), tabDefinitions.length - 1);
    };

    // Parse the route param once.
    // If parsing fails, we keep null so TypeScript and runtime are both explicit.
    const parsedProjectId = id ? Number.parseInt(id, 10) : null;
    const projectId = parsedProjectId !== null && !Number.isNaN(parsedProjectId) ? parsedProjectId : null;

    const [projectTitle, setProjectTitle] = useState("Project Details");

    const defaultTabIndex = clampTabIndex(location.state?.activeTab, 1);
    const tabIndexFromSlug = tabName
        ? tabDefinitions.findIndex((tab) => tab.slug === tabName)
        : defaultTabIndex;
    const currentTab = tabIndexFromSlug >= 0 ? tabIndexFromSlug : defaultTabIndex;
    useEffect(() => {
        let isMounted = true;

        const loadProjectTitle = async () => {
            // Guard: don't fetch if projectId is null (invalid URL)
            if (projectId === null) return;

            try {
                const project = await getProjectById(projectId);
                if (isMounted && project.project_title.trim() !== "") {
                    setProjectTitle(project.project_title);
                }
            } catch {
                if (isMounted) {
                    setProjectTitle("Project Details");
                }
            }
        };

        loadProjectTitle();

        return () => {
            isMounted = false;
        };
    }, [projectId]);

    if (projectId === null) {
        return (
            <MainLayout>
                <Container sx={{ mt: 4 }}>
                    <Typography variant="h4" color="error">
                        Invalid Project ID
                    </Typography>
                </Container>
            </MainLayout>
        );
    }

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        const nextSlug = tabDefinitions[newValue]?.slug ?? "metadata";
        navigate(`/projects/${projectId}/${nextSlug}`);
    };

    const renderComingSoonTab = (label: string) => (
        <SectionCard sx={{ textAlign: "center" }}>
            <Typography variant="h6" color="text.secondary">
                {label} Tab (Coming Soon)
            </Typography>
        </SectionCard>
    );

    return (
        <MainLayout>
            {/* The main container is "lg" to allow future data tables to be wide */}
            <Container
                maxWidth={false} // Disable default width breakpoints
                sx={{
                    maxWidth: {
                        xs: '100%',
                        md: '900px',
                        lg: '1100px' // Your value between md and lg
                    },
                    mx: 'auto', // Center the container when maxWidth is false
                    mt: 4,
                    mb: 8
                }}
            >

                {/* TOP HEADER SECTION (Matches Mockup) */}
                <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box>
                        <Typography variant="h4" gutterBottom>
                            Project
                        </Typography>
                        <Typography variant="h5" color="text.secondary">
                            {projectTitle}
                        </Typography>
                    </Box>

                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => navigate(`/explore?projects=${projectId}`)}
                    >
                        EXPLORE
                    </Button>
                </Box>

                {/* TABS NAVIGATION */}
                <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
                    <Tabs
                        value={currentTab}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        <Tab value={0} icon={<BarChartIcon />} iconPosition="start" label="STATS" />
                        <Tab value={1} icon={<TextSnippetIcon />} iconPosition="start" label="METADATA" />
                        <Tab value={2} icon={<CloudIcon />} iconPosition="start" label="DATA" />
                        <Tab value={3} icon={<DownloadIcon />} iconPosition="start" label="IMPORT" />
                        <Tab value={4} icon={<SyncIcon />} iconPosition="start" label="UPDATE" />
                        <Tab value={5} icon={<LockIcon />} iconPosition="start" label="SECURITY" />
                        <Tab value={6} icon={<AssignmentIcon />} iconPosition="start" label="TASKS" />
                        <Tab value={7} icon={<BackupIcon />} iconPosition="start" label="BACKUP" />
                    </Tabs>
                </Box>

                {/* TAB CONTENT RENDERER */}
                {/* We removed the <Paper> wrapper here because ProjectMetadataTab handles its own <Paper> and constraints */}
                <Box sx={{ minHeight: 400, borderRadius: 2 }}>

                    {currentTab === 0 && (
                        <ProjectStatsTab
                            onImportData={() => navigate(`/projects/${projectId}/import`)}
                            onLinkProject={() => navigate(`/projects/${projectId}/metadata#ecotaxa-link`)}
                        />
                    )}

                    {currentTab === 1 && <ProjectMetadataTab projectId={projectId} />}

                    {currentTab === 2 && <ProjectDataTab projectId={projectId} />}
                    {currentTab === 3 && <ProjectImportTab projectId={projectId} />}
                    {currentTab === 4 && renderComingSoonTab("Update")}
                    {currentTab === 5 && <ProjectSecurityTab projectId={projectId} />}
                    {currentTab === 6 && <ProjectTasksTab projectId={projectId} />}
                    {currentTab === 7 && <ProjectBackupTab projectId={projectId} />}
                </Box>
            </Container>
        </MainLayout>
    );
}