import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import {
    Alert,
    Box,
    Container,
    Typography,
    Button,
    Snackbar,
    Stack,
    Tabs,
    Tab,
    Tooltip,
} from "@mui/material";
import MainLayout from "@/app/layouts/MainLayout";
import SectionCard from "@/shared/components/SectionCard";
import { useAuthStore } from "@/features/auth/store/auth.store";

// Import your tabs
import { ProjectMetadataTab } from "../components/ProjectMetadataTab";
import { ProjectSecurityTab } from "../components/ProjectSecurityTab";

import { ProjectBackupTab } from "../components/ProjectBackupTab";
import { ProjectImportTab } from "../components/ProjectImportTab";
import { ProjectTasksTab } from "../components/ProjectTasksTab";
import { ProjectStatsTab } from "../components/ProjectStatsTab";
import { deleteProject, getProjectById } from "../api/projects.api";

// Icons based on your mockup
import BarChartIcon from "@mui/icons-material/BarChart";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import CloudIcon from "@mui/icons-material/Cloud";
import DownloadIcon from "@mui/icons-material/Download";
import SyncIcon from "@mui/icons-material/Sync";
import LockIcon from "@mui/icons-material/Lock";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BackupIcon from "@mui/icons-material/Backup";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { ProjectDataTab } from "../components/ProjectDataTab";

export default function ProjectDetailsPage() {
    const { id, tabName } = useParams<{ id: string; tabName?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = useAuthStore((state) => state.user);

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
    // Managers of the loaded project: DELETE is a manager-only action server-side,
    // so we only offer the button to a manager (or an admin).
    const [managerIds, setManagerIds] = useState<number[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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
                if (!isMounted) return;

                if (project.project_title.trim() !== "") {
                    setProjectTitle(project.project_title);
                }
                setManagerIds(
                    (project.managers ?? [])
                        .map((manager) => Number(manager.user_id))
                        .filter((userId) => !Number.isNaN(userId)),
                );
            } catch {
                if (isMounted) {
                    setProjectTitle("Project Details");
                    setManagerIds([]);
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

    const canDelete =
        currentUser?.is_admin === true ||
        (currentUser != null && managerIds.includes(Number(currentUser.user_id)));

    const handleDeleteProject = async () => {
        if (!window.confirm(
            `Are you sure you want to delete "${projectTitle}"? ` +
            `This also removes its samples and any linked EcoTaxa project. This cannot be undone.`,
        )) return;

        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteProject(projectId);
            navigate("/projects");
        } catch (err) {
            console.error("[Project Details] Delete failed", err);
            setDeleteError(err instanceof Error ? err.message : "Unknown error while deleting the project.");
        } finally {
            setIsDeleting(false);
        }
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

                    <Stack direction="row" spacing={2} alignItems="center">
                        {canDelete && (
                            <Tooltip title="Permanently delete this project, its samples and any linked EcoTaxa project">
                                <span>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        onClick={handleDeleteProject}
                                        disabled={isDeleting}
                                    >
                                        DELETE
                                    </Button>
                                </span>
                            </Tooltip>
                        )}

                        <Button
                            variant="outlined"
                            color="primary"
                            onClick={() => navigate(`/explore?projects=${projectId}`)}
                        >
                            EXPLORE
                        </Button>
                    </Stack>
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

            <Snackbar
                open={deleteError !== null}
                autoHideDuration={6000}
                onClose={() => setDeleteError(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setDeleteError(null)}
                    severity="error"
                    variant="filled"
                    sx={{ width: "100%" }}
                >
                    Failed to delete the project: {deleteError}
                </Alert>
            </Snackbar>
        </MainLayout>
    );
}