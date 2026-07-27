import { useMemo } from "react";
import {
    Box, Typography, Button, TextField, MenuItem,
    Snackbar, Alert, Stack, IconButton, CircularProgress, Tooltip, Paper, Chip
} from "@mui/material";

import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import InfoTooltip from "@/shared/components/InfoTooltip";
import FilterListIcon from "@mui/icons-material/FilterList";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import LaunchIcon from "@mui/icons-material/Launch";

import { useNavigate, useSearchParams } from "react-router-dom";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";

import { useTasksTable } from "@/features/projects/hooks/useTasksTable";
import { SearchFilter, Task } from "@/features/projects/api/projects.api";
import { buildBaseTaskColumns, isDownloadableTask } from "@/features/projects/utils/taskColumns";
import { parseUserIdsParam } from "../utils/userFilterParams";

/**
 * AdminTasksTab — the "TASKS" panel of the EcoPart administration page.
 *
 * Reuses the same server-side task table as the global Tasks page
 * (`useTasksTable`): the backend scopes results to the caller, and admins see
 * every project's tasks. Only the surrounding chrome differs — this view adds
 * the admin bulk-action bar (DELETE + the reserved USERS / PROJECTS actions)
 * from the mockup.
 */
export default function AdminTasksTab() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // When opened from the USERS tab (?owner=1,2,3), scope the list to those
    // task owners. Memoized so the array stays referentially stable for the hook.
    const ownerIds = useMemo(() => parseUserIdsParam(searchParams.get("owner")), [searchParams]);
    const extraFilters = useMemo<SearchFilter[]>(() => {
        if (ownerIds.length === 0) return [];
        return [
            ownerIds.length === 1
                ? { field: "task_owner_id", operator: "=", value: ownerIds[0] }
                : { field: "task_owner_id", operator: "IN", value: ownerIds },
        ];
    }, [ownerIds]);

    const clearOwnerFilter = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("owner");
        setSearchParams(next, { replace: true });
    };

    const {
        tasks, loading, totalRows, error,
        paginationModel, setPaginationModel,
        selectedTasks, setSelectedTasks, selectionCount,
        searchText, setSearchText,
        searchAttribute, setSearchAttribute,
        isActionRunning,
        handleDeleteTasks,
        downloadingTaskId, handleDownloadTaskFile,
        snackbar, closeSnackbar
    } = useTasksTable(extraFilters);

    const columns: GridColDef<Task>[] = [
        ...buildBaseTaskColumns(),
        {
            field: "actions",
            headerName: "",
            width: 90,
            sortable: false,
            renderCell: (params: GridRenderCellParams<Task>) => {
                if (!isDownloadableTask(params.row)) return null;
                const isDownloading = downloadingTaskId === params.row.task_id;
                return (
                    // Stop clicks anywhere in the actions cell from bubbling to the
                    // row's onRowClick (the disabled download button otherwise reaches
                    // the row via its Tooltip span and navigates away mid-download).
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Download export file">
                            <span>
                                <IconButton
                                    size="small"
                                    disabled={isDownloading}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadTaskFile(params.row.task_id);
                                    }}
                                >
                                    {isDownloading
                                        ? <CircularProgress size={16} />
                                        : <DownloadIcon fontSize="small" />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                );
            }
        }
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

    return (
        <Box>
            {error && (
                <Box sx={{ mb: 2 }}>
                    <Alert severity="error" variant="outlined">
                        Failed to load tasks: <strong>{error}</strong>
                    </Alert>
                </Box>
            )}

            <Paper variant="outlined" sx={{ width: "100%", overflow: "hidden" }}>
                {/* 1. HEADER + FILTER CONTROLS */}
                <Box sx={{ p: 3, borderBottom: "1px solid #e0e0e0" }}>
                    <Typography variant="h6">Task list</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Additional description if required
                    </Typography>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 3, alignItems: "center" }}>
                        <TextField
                            size="small"
                            label="Search"
                            placeholder={searchAttribute === "task_id" ? "Search by id (exact)" : "Label, owner, etc..."}
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
                            <MenuItem value="task_type">Label</MenuItem>
                            <MenuItem value="task_owner">Owner</MenuItem>
                            <MenuItem value="task_status">Status</MenuItem>
                            <MenuItem value="task_id">Task id</MenuItem>
                        </TextField>
                        <Tooltip title="Advanced filters (coming soon)">
                            <span>
                                <IconButton disabled>
                                    <FilterListIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                        {ownerIds.length > 0 && (
                            <Chip
                                color="primary"
                                variant="outlined"
                                onDelete={clearOwnerFilter}
                                label={
                                    ownerIds.length === 1
                                        ? `Owned by user #${ownerIds[0]}`
                                        : `Owned by ${ownerIds.length} users`
                                }
                            />
                        )}
                    </Stack>
                </Box>

                {/* 2. SELECTION ACTIONS BAR */}
                <Box sx={{ p: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f5f5f5" }}>
                    <Typography variant="body2" fontWeight="bold">
                        {selectionCount} items selected
                        <InfoTooltip
                            title={
                                <Typography variant="caption" component="p">
                                    DELETE removes the selected background tasks and their logs across all projects. You
                                    are asked to confirm first. It does not undo work a completed task already performed.
                                </Typography>
                            }
                        />
                    </Typography>
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="text" color="inherit"
                            disabled={selectionCount === 0 || isActionRunning}
                            onClick={handleDeleteTasks}
                            startIcon={<CloseIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            DELETE
                        </Button>
                        {/* USERS / PROJECTS: reserved admin bulk actions from the mockup.
                            No backend endpoint exists yet, so they stay disabled like the
                            other not-yet-wired task actions (RESTART on the project tab). */}
                        <Tooltip title="Coming soon">
                            <span>
                                <Button variant="text" color="inherit" disabled startIcon={<PeopleAltIcon />} sx={{ fontWeight: "bold" }}>
                                    USERS
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title="Coming soon">
                            <span>
                                <Button variant="text" color="inherit" disabled startIcon={<LaunchIcon />} sx={{ fontWeight: "bold" }}>
                                    PROJECTS
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                </Box>

                {/* 3. TABLE */}
                <Box sx={{ width: "100%" }}>
                    <DataGrid
                        rows={tasks}
                        columns={columns}
                        getRowId={(row) => row.task_id}
                        onRowClick={(params) => {
                            const projectId = params.row.task_project_id;
                            // Remember we came from the admin console so the task page's
                            // "Back to tasks list" returns here, not to the project tasks tab.
                            if (projectId != null) navigate(`/projects/${projectId}/tasks/${params.row.task_id}`, { state: { from: "/admin/tasks" } });
                        }}
                        checkboxSelection
                        disableRowSelectionExcludeModel
                        disableRowSelectionOnClick
                        loading={loading}
                        rowSelectionModel={selectedTasks}
                        onRowSelectionModelChange={setSelectedTasks}
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
