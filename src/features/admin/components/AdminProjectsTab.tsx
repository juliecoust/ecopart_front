import { useMemo } from "react";
import {
    Box, Typography, Button, TextField, MenuItem,
    Snackbar, Alert, Stack, IconButton, Tooltip, Paper, Chip
} from "@mui/material";

import FilterListIcon from "@mui/icons-material/FilterList";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import InfoTooltip from "@/shared/components/InfoTooltip";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import AssignmentIcon from "@mui/icons-material/Assignment";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";

import { useNavigate, useSearchParams } from "react-router-dom";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";

import { MinimalUserModel, Project, SearchFilter } from "@/features/projects/api/projects.api";
import { useAdminProjectsTable } from "../hooks/useAdminProjectsTable";
import { parseUserIdsParam } from "../utils/userFilterParams";

/** Comma-separated user names for a privilege array; "—" when empty. */
const renderPeopleCell = (users: MinimalUserModel[] | undefined) => {
    const names = (users ?? [])
        .map((user) => {
            // The backend builds user_name from the user's first/last name and can
            // return "undefined undefined" / "null null" when those are missing.
            // Strip those tokens, then fall back to the email, then a "#id" label,
            // so a nameless account never renders as "undefined undefined" or blank.
            const cleaned = user.user_name
                ?.replace(/\b(?:undefined|null)\b/g, "")
                .replace(/\s+/g, " ")
                .trim();
            if (cleaned) return cleaned;
            if (user.email?.trim()) return user.email.trim();
            return user.user_id != null ? `#${user.user_id}` : "";
        })
        .filter((name): name is string => Boolean(name));

    if (names.length === 0) {
        return <Typography variant="caption" color="text.secondary">—</Typography>;
    }

    return (
        <Tooltip title={names.join(", ")}>
            <Typography variant="body2" noWrap>{names.join(", ")}</Typography>
        </Tooltip>
    );
};

/**
 * AdminProjectsTab — the "PROJECTS" panel of the EcoPart administration page.
 *
 * Lists EVERY project (the admin scope, unlike the user-facing "My projects"
 * page) with server-side search + pagination through `useAdminProjectsTable`.
 * The only wired bulk action is DELETE; the REMOVE ALL MANAGER / MEMBERS and
 * the TASKS / USERS shortcuts from the mockup have no backend endpoint yet and
 * stay disabled, matching the AdminUsersTab / AdminTasksTab convention.
 */
export default function AdminProjectsTab() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // When opened from the USERS tab (?users=1,2,3), scope the list to projects
    // where those users are manager OR member (backend `granted_users` filter).
    const userIds = useMemo(() => parseUserIdsParam(searchParams.get("users")), [searchParams]);
    const extraFilters = useMemo<SearchFilter[]>(() => {
        if (userIds.length === 0) return [];
        return [
            userIds.length === 1
                ? { field: "granted_users", operator: "=", value: userIds[0] }
                : { field: "granted_users", operator: "IN", value: userIds },
        ];
    }, [userIds]);

    const clearUserFilter = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("users");
        setSearchParams(next, { replace: true });
    };

    const {
        projects, loading, totalRows, error,
        paginationModel, setPaginationModel,
        selectedProjects, setSelectedProjects, selectionCount,
        searchText, setSearchText,
        searchAttribute, setSearchAttribute,
        isActionRunning,
        handleDeleteProjects,
        snackbar, closeSnackbar
    } = useAdminProjectsTable(extraFilters);

    const columns: GridColDef<Project>[] = [
        { field: "project_id", headerName: "ID", width: 80 },
        { field: "project_title", headerName: "Title", flex: 1.4, minWidth: 160 },
        { field: "instrument_model", headerName: "Instrument", width: 120 },
        {
            field: "ecotaxa_project_name",
            headerName: "EcoTaxa project",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params: GridRenderCellParams<Project>) =>
                params.value ? (
                    <Typography variant="body2" noWrap>{params.value as string}</Typography>
                ) : (
                    <Chip
                        label="Not linked"
                        size="small"
                        variant="outlined"
                        sx={{ color: "text.secondary", borderColor: "divider" }}
                    />
                ),
        },
        { field: "root_folder_path", headerName: "Root path", flex: 1.2, minWidth: 150 },
        {
            field: "nbr_sample",
            headerName: "Nb of samples",
            width: 120,
            align: "center",
            headerAlign: "center",
            sortable: false,
            renderCell: (params: GridRenderCellParams<Project>) =>
                typeof params.value === "number"
                    ? <Typography variant="body2">{params.value}</Typography>
                    : <Typography variant="caption" color="text.secondary">—</Typography>,
        },
        {
            field: "managers",
            headerName: "Managers",
            flex: 1,
            minWidth: 140,
            sortable: false,
            renderCell: (params: GridRenderCellParams<Project>) => renderPeopleCell(params.row.managers),
        },
        {
            field: "members",
            headerName: "Members",
            flex: 1,
            minWidth: 140,
            sortable: false,
            renderCell: (params: GridRenderCellParams<Project>) => renderPeopleCell(params.row.members),
        },
    ];

    const dataGridStyles = {
        border: "none",
        "& .MuiDataGrid-columnHeaders": {
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e0e0e0",
            color: "text.secondary",
            fontWeight: "normal",
        },
        "& .MuiDataGrid-cell": { borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center" },
        "& .MuiDataGrid-row": { cursor: "pointer" },
        "& .MuiDataGrid-row:nth-of-type(even)": { backgroundColor: '#f8faff' },
        "& .MuiDataGrid-row.Mui-selected": {
            backgroundColor: "#e6f0ff",
            "&:hover": { backgroundColor: "#d9e8ff" }
        },
    };

    // Numeric exact-match attributes (project id, manager / member user id) get an
    // "id (exact)" placeholder; the LIKE text attributes get the generic one.
    const isNumericAttribute = ["project_id", "managers", "members"].includes(searchAttribute);

    const actionsDisabled = selectionCount === 0 || isActionRunning;

    return (
        <Box>
            {error && (
                <Box sx={{ mb: 2 }}>
                    <Alert severity="error" variant="outlined">
                        Failed to load projects: <strong>{error}</strong>
                    </Alert>
                </Box>
            )}

            <Paper variant="outlined" sx={{ width: "100%", overflow: "hidden" }}>
                {/* 1. HEADER + FILTER CONTROLS */}
                <Box sx={{ p: 3, borderBottom: "1px solid #e0e0e0" }}>
                    <Typography variant="h6">Project list</Typography>
                    <Typography variant="body2" color="text.secondary">
                        All projects with advanced filters
                    </Typography>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 3, alignItems: "center" }}>
                        <TextField
                            size="small"
                            label="Search"
                            placeholder={isNumericAttribute ? "Search by id (exact)" : "Title, acronym, etc..."}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            sx={{ width: 300 }}
                        />
                        <TextField
                            select
                            size="small"
                            label="Attribute"
                            value={searchAttribute}
                            onChange={(e) => setSearchAttribute(e.target.value)}
                            sx={{ width: 200 }}
                        >
                            <MenuItem value="project_title">Title</MenuItem>
                            <MenuItem value="project_acronym">Acronym</MenuItem>
                            <MenuItem value="instrument_model">Instrument model</MenuItem>
                            <MenuItem value="ecotaxa_project_name">EcoTaxa project</MenuItem>
                            <MenuItem value="cruise">Cruise</MenuItem>
                            <MenuItem value="ship">Ship</MenuItem>
                            <MenuItem value="project_id">Project id</MenuItem>
                            {/* managers / members resolve a user id to the projects where
                                that user holds the privilege (backend-side). */}
                            <MenuItem value="managers">Manager (user id)</MenuItem>
                            <MenuItem value="members">Member (user id)</MenuItem>
                        </TextField>
                        <Tooltip title="Advanced filters (coming soon)">
                            <span>
                                <IconButton disabled>
                                    <FilterListIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                        {userIds.length > 0 && (
                            <Chip
                                color="primary"
                                variant="outlined"
                                onDelete={clearUserFilter}
                                label={
                                    userIds.length === 1
                                        ? `User #${userIds[0]}`
                                        : `${userIds.length} users`
                                }
                            />
                        )}
                        <Box sx={{ flexGrow: 1 }} />
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => navigate("/new-project")}
                            sx={{ whiteSpace: "nowrap" }}
                        >
                            NEW PROJECT
                        </Button>
                    </Stack>
                </Box>

                {/* 2. SELECTION ACTIONS BAR */}
                <Box sx={{ p: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, backgroundColor: "#f5f5f5" }}>
                    <Typography variant="body2" fontWeight="bold">
                        {selectionCount} items selected
                        <InfoTooltip
                            title={
                                <Typography variant="caption" component="p">
                                    DELETE permanently deletes the selected projects, including their samples and any
                                    linked EcoTaxa project. This cannot be undone.
                                </Typography>
                            }
                        />
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                        <Button
                            variant="text" color="inherit"
                            disabled={actionsDisabled}
                            onClick={handleDeleteProjects}
                            startIcon={<CloseIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            DELETE
                        </Button>
                        {/* REMOVE ALL MANAGER / MEMBERS, TASKS and USERS: reserved admin bulk
                            actions from the mockup. No backend endpoint exists yet, so they stay
                            disabled like the other not-yet-wired admin actions. */}
                        <Tooltip title="Coming soon">
                            <span>
                                <Button variant="text" color="inherit" disabled startIcon={<PersonRemoveIcon />} sx={{ fontWeight: "bold" }}>
                                    REMOVE ALL MANAGER
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title="Coming soon">
                            <span>
                                <Button variant="text" color="inherit" disabled startIcon={<GroupRemoveIcon />} sx={{ fontWeight: "bold" }}>
                                    REMOVE ALL MEMBERS
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title="Coming soon">
                            <span>
                                <Button variant="text" color="inherit" disabled startIcon={<AssignmentIcon />} sx={{ fontWeight: "bold" }}>
                                    TASKS
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title="Coming soon">
                            <span>
                                <Button variant="text" color="inherit" disabled startIcon={<PeopleAltIcon />} sx={{ fontWeight: "bold" }}>
                                    USERS
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                </Box>

                {/* 3. TABLE */}
                <Box sx={{ width: "100%" }}>
                    <DataGrid
                        rows={projects}
                        columns={columns}
                        getRowId={(row) => row.project_id}
                        onRowClick={(params) => navigate(`/projects/${params.row.project_id}/metadata`)}
                        checkboxSelection
                        disableRowSelectionExcludeModel
                        disableRowSelectionOnClick
                        loading={loading}
                        rowSelectionModel={selectedProjects}
                        onRowSelectionModelChange={setSelectedProjects}
                        paginationMode="server"
                        rowCount={totalRows}
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        pageSizeOptions={[5, 10, 25]}
                        autoHeight
                        sx={dataGridStyles}
                    />
                </Box>
            </Paper>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={closeSnackbar} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: "100%" }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
