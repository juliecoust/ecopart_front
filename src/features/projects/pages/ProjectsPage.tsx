import { useMemo, useState } from "react";
import {
    Box,
    Container,
    Typography,
    Button,
    TextField,
    Stack,
    Chip,
    InputAdornment,
    Menu,
    MenuItem,
    IconButton,
    Alert,
    Snackbar,
    Tooltip
} from "@mui/material";
import {
    DataGrid,
    GridColDef,
    GridRenderCellParams,
    GridRowParams,
} from "@mui/x-data-grid";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { useNavigate } from "react-router-dom";
import MainLayout from "@/app/layouts/MainLayout";
import SectionCard from "@/shared/components/SectionCard";
import { MinimalUserModel, Project } from "../api/projects.api";
import { useProjectsTable } from "../hooks/useProjectsTable";
import { useAuthStore } from "@/features/auth/store/auth.store";

/**
 * ProjectsPage Component
 *
 * Displays a paginated list of projects with filtering, searching, and selection capabilities.
 * It integrates with the `useProjectsTable` hook for server-side data fetching.
 */
export default function ProjectsPage() {
    const navigate = useNavigate();

    // ---------------------------------------------------------------------------
    // Auth State
    // ---------------------------------------------------------------------------
    const currentUser = useAuthStore((s) => s.user);

    // ---------------------------------------------------------------------------
    // State Management (via Custom Hook)
    // ---------------------------------------------------------------------------
    const {
        projects,
        loading,
        totalRows,
        error,
        searchText,
        setSearchText,
        searchAttribute,
        setSearchAttribute,
        selectedFilter,
        setSelectedFilter,
        paginationModel,
        setPaginationModel,
        rowSelectionModel,
        setRowSelectionModel,
        isActionRunning,
        handleDeleteProjects,
        snackbar,
        closeSnackbar
    } = useProjectsTable();

    // ---------------------------------------------------------------------------
    // Local UI State
    // ---------------------------------------------------------------------------
    const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
    const openFilter = Boolean(filterAnchorEl);

    // ---------------------------------------------------------------------------
    // Debug Helpers
    // ---------------------------------------------------------------------------
    const normalizedCurrentUserId = useMemo(() => {
        if (!currentUser?.user_id && currentUser?.user_id !== 0) {
            return null;
        }

        const parsed = Number(currentUser.user_id);
        return Number.isNaN(parsed) ? null : parsed;
    }, [currentUser]);


    // ---------------------------------------------------------------------------
    // Event Handlers
    // ---------------------------------------------------------------------------
    const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setFilterAnchorEl(event.currentTarget);
    };

    const handleFilterClose = (filterValue?: string) => {
        setFilterAnchorEl(null);
        if (typeof filterValue === "string") {
            setSelectedFilter(filterValue);
        }
    };

    const handleExploreSelection = () => {
        const joinedIds = Array.from(rowSelectionModel.ids).join(",");
        navigate(`/explore?projects=${joinedIds}`);
    };

    const handleClearSelection = () => {
        setRowSelectionModel({ type: "include", ids: new Set() });
    };

    const handleRowClick = (params: GridRowParams<Project>) => {
        navigate(`/projects/${params.row.project_id}/metadata`);
    };

    // ---------------------------------------------------------------------------
    // Helper Functions
    // ---------------------------------------------------------------------------

    const hasCurrentUser = (
        users: MinimalUserModel[] | undefined,
        currentUserId: number | null
    ): boolean => {
        if (!Array.isArray(users) || currentUserId === null) {
            return false;
        }

        return users.some((user) => {
            const normalizedUserId = Number(user.user_id);
            return !Number.isNaN(normalizedUserId) && normalizedUserId === currentUserId;
        });
    };

    const getCurrentUserPrivilege = (project: Project): string | null => {
        if (normalizedCurrentUserId === null) {
            return null;
        }

        const isManager = hasCurrentUser(project.managers, normalizedCurrentUserId);
        if (isManager) return "Manager";

        const isMember = hasCurrentUser(project.members, normalizedCurrentUserId);
        if (isMember) return "Member";

        const normalizedContactUserId =
            project.contact && project.contact.user_id !== undefined
                ? Number(project.contact.user_id)
                : null;

        if (
            normalizedContactUserId !== null &&
            !Number.isNaN(normalizedContactUserId) &&
            normalizedContactUserId === normalizedCurrentUserId
        ) {
            return "Contact";
        }

        return null;
    };

    const selectedProjectIds =
        rowSelectionModel.type === "exclude" ? [] : Array.from(rowSelectionModel.ids).map(Number);

    // Deleting a project is a manager-only action server-side (admins aside), so
    // DELETE stays disabled while the selection holds a project the current user
    // only reads as member or contact. Selected ids whose row is no longer loaded
    // (picked on an earlier page) are left for the server to accept or reject.
    const canDeleteSelection =
        selectedProjectIds.length > 0 &&
        (currentUser?.is_admin === true ||
            selectedProjectIds.every((projectId) => {
                const project = projects.find((candidate) => candidate.project_id === projectId);
                return !project || getCurrentUserPrivilege(project) === "Manager";
            }));

    // ---------------------------------------------------------------------------
    // DataGrid Columns Configuration
    // ---------------------------------------------------------------------------
    const columns: GridColDef[] = [
        {
            field: "project_title",
            headerName: "Title",
            flex: 1.5,
            renderCell: (params: GridRenderCellParams<Project>) => (
                <span style={{ fontWeight: 500 }}>
                    {params.value} <span style={{ color: "#888" }}>[{params.row.project_id}]</span>
                </span>
            ),
        },
        { field: "instrument_model", headerName: "Instrument", flex: 1 },
        {
            field: "ecotaxa_project_name",
            headerName: "EcoTaxa Project",
            flex: 1.5,
            align: "center",
            headerAlign: "center",
            renderCell: (params) =>
                params.value ? (
                    <Typography variant="body2">{params.value}</Typography>
                ) : (
                    <Chip
                        label="Not linked"
                        size="small"
                        variant="outlined"
                        color="default"
                        sx={{ color: "text.secondary", borderColor: "divider" }}
                    />
                ),
        },
        { field: "root_folder_path", headerName: "RootFolder", flex: 2 },
        {
            field: "nbr_sample",
            headerName: "Nbr Sample",
            width: 120,
            align: "center",
            headerAlign: "center",
            renderCell: (params: GridRenderCellParams<Project>) =>
                typeof params.value === "number" ? (
                    <Typography variant="body2">{params.value}</Typography>
                ) : (
                    <Typography variant="caption" color="text.secondary">
                        —
                    </Typography>
                ),
        },
        {
            field: "privilege",
            headerName: "Privilege",
            width: 120,
            renderCell: (params: GridRenderCellParams<Project>) => {
                const privilege = getCurrentUserPrivilege(params.row);
                return privilege ? (
                    <Chip
                        label={privilege}
                        size="small"
                        sx={{
                            backgroundColor: "#e0e0e0",
                            fontWeight: "bold",
                        }}
                    />
                ) : (
                    <Typography variant="caption" color="text.secondary">
                        -
                    </Typography>
                );
            },
        },
        {
            field: "qc_state",
            headerName: "QC state",
            width: 150,
            renderCell: (params) => {
                if (params.value === "validated") return <CheckCircleIcon color="success" />;
                if (params.value === "warning")
                    return (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            <WarningIcon color="warning" fontSize="small" />
                            <Typography variant="caption" color="warning.main">
                                calibration
                            </Typography>
                        </Stack>
                    );

                return params.value ? (
                    <Typography variant="caption">{params.value}</Typography>
                ) : (
                    <Typography variant="caption" color="text.secondary">
                        -
                    </Typography>
                );
            },
        },
    ];

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <MainLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
                <Box sx={{ mb: 4, textAlign: "center" }}>
                    <Typography variant="h4" gutterBottom>
                        My projects
                    </Typography>
                </Box>

                {error && (
                    <Box sx={{ mb: 2 }}>
                        <Alert severity="error" variant="outlined">
                            Failed to load projects from server: <strong>{error}</strong>
                        </Alert>
                    </Box>
                )}

                {/* SINGLE CARD: header + controls, then the table */}
                <SectionCard sx={{ p: 0, overflow: "hidden" }}>
                    {/* HEADER + FILTER CONTROLS */}
                    <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Typography variant="body2" color="text.secondary">
                            Projects in which you have privilege
                        </Typography>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 3, alignItems: "center" }}>
                            <TextField
                                size="small"
                                sx={{ flexGrow: 1 }}
                                placeholder={searchAttribute === "project_id" ? "Search by ID (exact)" : "Search..."}
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />

                            <TextField
                                select
                                label="Attribute"
                                value={searchAttribute}
                                onChange={(e) => setSearchAttribute(e.target.value)}
                                size="small"
                                sx={{ width: 210 }}
                            >
                                {/* Labels mirror the real backend field they filter on
                                (see PublicProjectResponse). */}
                                <MenuItem value="project_id">ID</MenuItem>
                                <MenuItem value="project_title">Title</MenuItem>
                                <MenuItem value="project_acronym">Acronym</MenuItem>
                                <MenuItem value="project_description">Description</MenuItem>
                                <MenuItem value="cruise">Cruise</MenuItem>
                                <MenuItem value="ship">Ship</MenuItem>
                                <MenuItem value="instrument_model">Instrument model</MenuItem>
                                <MenuItem value="serial_number">Serial number</MenuItem>
                                <MenuItem value="data_owner_name">Owner name</MenuItem>
                                <MenuItem value="data_owner_email">Owner email</MenuItem>
                                <MenuItem value="operator_name">Operator name</MenuItem>
                                <MenuItem value="operator_email">Operator email</MenuItem>
                                <MenuItem value="chief_scientist_name">Chief scientist name</MenuItem>
                                <MenuItem value="chief_scientist_email">Chief scientist email</MenuItem>
                                <MenuItem value="ecotaxa_project_name">EcoTaxa project</MenuItem>
                            </TextField>

                            <Button startIcon={<FilterListIcon />} color="inherit" onClick={handleFilterClick} sx={{ whiteSpace: 'nowrap' }}>
                                {selectedFilter === "All" ? "All My Projects" :
                                    selectedFilter === "Manager" ? "My Managed Projects" :
                                        `Filter: ${selectedFilter}`}
                            </Button>

                            <Menu anchorEl={filterAnchorEl} open={openFilter} onClose={() => handleFilterClose()}>
                                <MenuItem onClick={() => handleFilterClose("All")}>All My Projects</MenuItem>
                                <MenuItem onClick={() => handleFilterClose("Manager")}>My Managed Projects</MenuItem>
                                <MenuItem onClick={() => handleFilterClose("Validated")}>Validated QC</MenuItem>
                            </Menu>

                            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/new-project")} sx={{ whiteSpace: 'nowrap' }}>
                                NEW PROJECT
                            </Button>
                        </Stack>
                    </Box>

                    <Box
                        sx={{
                            p: 2,
                            backgroundColor: "grey.100",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            borderBottom: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <Stack direction="row" alignItems="center" spacing={2}>
                            <IconButton
                                size="small"
                                onClick={handleClearSelection}
                                title="Clear selection"
                                disabled={rowSelectionModel.ids.size === 0}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                            <Typography fontWeight="bold">{rowSelectionModel.ids.size} items selected</Typography>
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={1}>
                            {/* DELETE is a manager-only action: the tooltip says why it is
                                greyed out when the selection is not deletable. */}
                            <Tooltip
                                title={
                                    rowSelectionModel.ids.size === 0
                                        ? "Select at least one project"
                                        : canDeleteSelection
                                            ? "Permanently delete the selected project(s), their samples and any linked EcoTaxa project"
                                            : "Only a project manager can delete a project"
                                }
                            >
                                <span>
                                    <Button
                                        color="inherit"
                                        startIcon={<DeleteOutlineIcon />}
                                        onClick={handleDeleteProjects}
                                        disabled={!canDeleteSelection || isActionRunning}
                                        sx={{ fontWeight: "bold" }}
                                    >
                                        DELETE
                                    </Button>
                                </span>
                            </Tooltip>

                            <Button
                                color="inherit"
                                endIcon={<ArrowForwardIcon />}
                                onClick={handleExploreSelection}
                                disabled={rowSelectionModel.ids.size === 0}
                                sx={{ fontWeight: "bold" }}
                            >
                                EXPLORE SELECTION
                            </Button>
                        </Stack>
                    </Box>

                    <Box sx={{ height: 600 }}>
                        <DataGrid
                            rows={projects}
                            columns={columns}
                            getRowId={(row) => row.project_id}
                            pagination
                            paginationMode="server"
                            rowCount={totalRows}
                            paginationModel={paginationModel}
                            onPaginationModelChange={setPaginationModel}
                            checkboxSelection
                            disableRowSelectionExcludeModel
                            rowSelectionModel={rowSelectionModel}
                            onRowSelectionModelChange={setRowSelectionModel}
                            loading={loading}
                            pageSizeOptions={[5, 10, 25, 50, 100, { value: Math.max(totalRows, 1), label: "All" }]}
                            disableRowSelectionOnClick
                            onRowClick={handleRowClick}
                            sx={{
                                border: 0,
                                '& .MuiDataGrid-row': {
                                    cursor: 'pointer',
                                },
                                // Vertically center every cell's content (custom renderCell
                                // content otherwise sticks to the top of the row).
                                "& .MuiDataGrid-cell": {
                                    display: "flex",
                                    alignItems: "center",
                                },
                                "& .MuiDataGrid-columnHeaders": {
                                    backgroundColor: "grey.100",
                                    fontWeight: "bold",
                                    borderTop: "none",
                                },
                            }}
                        />
                    </Box>
                </SectionCard>
            </Container>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={closeSnackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: "100%" }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </MainLayout>
    );
}