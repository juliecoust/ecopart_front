import { useState } from "react";
import {
    Box, Typography, Button, TextField, MenuItem,
    Snackbar, Alert, Stack, IconButton, Tooltip, Paper
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import InfoTooltip from "@/shared/components/InfoTooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import RemoveModeratorIcon from "@mui/icons-material/RemoveModerator";
import AssignmentIcon from "@mui/icons-material/Assignment";
import LaunchIcon from "@mui/icons-material/Launch";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import ErrorIcon from "@mui/icons-material/Error";

import { useNavigate } from "react-router-dom";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";

import { CountriesWrapper } from "@/shared/country-wrapper";
import { AdminUser } from "../api/adminUsers.api";
import { useAdminUsersTable } from "../hooks/useAdminUsersTable";
import CreateUserModal from "./CreateUserModal";

/** Human-readable account status derived from the admin-only user fields. */
const renderAccountStatusCell = (params: GridRenderCellParams<AdminUser>) => {
    const { deleted, valid_email } = params.row;

    if (deleted) {
        return (
            <Tooltip title="Deactivated">
                <ErrorIcon color="error" fontSize="small" />
            </Tooltip>
        );
    }

    if (valid_email === false) {
        return (
            <Tooltip title="Pending email confirmation">
                <MailOutlineIcon sx={{ color: "warning.main" }} fontSize="small" />
            </Tooltip>
        );
    }

    return (
        <Tooltip title="Active">
            <CheckCircleIcon color="success" fontSize="small" />
        </Tooltip>
    );
};

const renderCountCell = (value: number | undefined) =>
    typeof value === "number"
        ? <Typography variant="body2">{value}</Typography>
        : <Typography variant="caption" color="text.secondary">—</Typography>;

export default function AdminUsersTab() {
    const navigate = useNavigate();
    const [createOpen, setCreateOpen] = useState(false);

    const {
        users, loading, totalRows, error,
        paginationModel, setPaginationModel,
        selectedUsers, setSelectedUsers, selectedUserIds, selectionCount,
        searchText, setSearchText,
        searchAttribute, setSearchAttribute,
        isActionRunning,
        handleSetAdmin,
        handleDeleteUsers,
        refetchUsers,
        showSnackbar,
        snackbar, closeSnackbar
    } = useAdminUsersTable();

    // TASKS / PROJECTS bulk shortcuts: jump to the matching admin tab, filtered to
    // the selected user(s). The target tab reads these query params and applies the
    // filter (task_owner_id for tasks, granted_users — manager OR member — for projects).
    const openFilteredTab = (tab: "tasks" | "projects") => {
        if (selectedUserIds.length === 0) return;
        const key = tab === "tasks" ? "owner" : "users";
        navigate(`/admin/${tab}?${key}=${selectedUserIds.join(",")}`);
    };

    const columns: GridColDef<AdminUser>[] = [
        { field: "user_id", headerName: "User id", width: 90 },
        {
            field: "name",
            headerName: "Name",
            flex: 1.2,
            minWidth: 140,
            valueGetter: (_value, row) => `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "—",
        },
        { field: "email", headerName: "Email", flex: 1.6, minWidth: 180 },
        {
            field: "organisation",
            headerName: "Organisation",
            flex: 1.2,
            minWidth: 140,
            valueGetter: (_value, row) => row.organisation || "—",
        },
        {
            field: "country",
            headerName: "Country",
            width: 130,
            valueGetter: (_value, row) =>
                row.country ? (CountriesWrapper.getName(row.country) ?? row.country) : "—",
        },
        {
            field: "user_creation_utc_date_time",
            headerName: "Creation date",
            width: 130,
            valueGetter: (_value, row) =>
                row.user_creation_utc_date_time
                    ? new Date(row.user_creation_utc_date_time).toLocaleDateString()
                    : "",
        },
        {
            field: "manager_count",
            headerName: "Manager",
            width: 100,
            align: "center",
            headerAlign: "center",
            sortable: false,
            renderCell: (params) => renderCountCell(params.row.manager_count),
        },
        {
            field: "member_count",
            headerName: "Member",
            width: 100,
            align: "center",
            headerAlign: "center",
            sortable: false,
            renderCell: (params) => renderCountCell(params.row.member_count),
        },
        {
            field: "is_admin",
            headerName: "Administrate",
            width: 120,
            align: "center",
            headerAlign: "center",
            valueGetter: (_value, row) => (row.is_admin ? "Yes" : "No"),
        },
        {
            field: "account_status",
            headerName: "Account status",
            width: 130,
            align: "center",
            headerAlign: "center",
            sortable: false,
            renderCell: renderAccountStatusCell,
        },
        {
            field: "actions",
            headerName: "",
            width: 60,
            sortable: false,
            renderCell: (params: GridRenderCellParams<AdminUser>) => (
                <Tooltip title="Edit user">
                    <span>
                        <IconButton
                            size="small"
                            disabled={Boolean(params.row.deleted)}
                            onClick={() => navigate(`/settings/${params.row.user_id}/ecopart_account`)}
                            aria-label={`Edit user ${params.row.user_id}`}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            ),
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
        "& .MuiDataGrid-row:nth-of-type(even)": { backgroundColor: '#f8faff' },
        "& .MuiDataGrid-row.Mui-selected": {
            backgroundColor: "#e6f0ff",
            "&:hover": { backgroundColor: "#d9e8ff" }
        },
    };

    const actionsDisabled = selectionCount === 0 || isActionRunning;

    return (
        <Box>
            {error && (
                <Box sx={{ mb: 2 }}>
                    <Alert severity="error" variant="outlined">
                        Failed to load users: <strong>{error}</strong>
                    </Alert>
                </Box>
            )}

            <Paper variant="outlined" sx={{ width: "100%", overflow: "hidden" }}>
                {/* 1. HEADER + FILTER CONTROLS */}
                <Box sx={{ p: 3, borderBottom: "1px solid #e0e0e0" }}>
                    <Typography variant="h6">User list</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Additional description if required
                    </Typography>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 3, alignItems: "center" }}>
                        <TextField
                            size="small"
                            label="Search"
                            placeholder={searchAttribute === "user_id" ? "Search by id (exact)" : "Name, email, etc..."}
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
                            <MenuItem value="last_name">Name</MenuItem>
                            <MenuItem value="email">Email</MenuItem>
                            <MenuItem value="organisation">Organisation</MenuItem>
                            <MenuItem value="country">Country</MenuItem>
                            <MenuItem value="user_id">User id</MenuItem>
                        </TextField>
                        <Box sx={{ flexGrow: 1 }} />
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setCreateOpen(true)}
                            sx={{ whiteSpace: "nowrap" }}
                        >
                            NEW USER
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
                                    ADD ADMIN grants full administrator rights to the selected users; REMOVE ADMIN
                                    revokes them. You are asked to confirm first.
                                </Typography>
                            }
                        />
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                        <Button
                            variant="text" color="inherit"
                            disabled={actionsDisabled}
                            onClick={() => handleSetAdmin(true)}
                            startIcon={<AdminPanelSettingsIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            ADD ADMIN
                        </Button>
                        <Button
                            variant="text" color="inherit"
                            disabled={actionsDisabled}
                            onClick={() => handleSetAdmin(false)}
                            startIcon={<RemoveModeratorIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            REMOVE ADMIN
                        </Button>
                        <Button
                            variant="text" color="error"
                            disabled={actionsDisabled}
                            onClick={handleDeleteUsers}
                            startIcon={<DeleteIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            DELETE
                        </Button>
                        <Button
                            variant="text" color="inherit"
                            disabled={actionsDisabled}
                            onClick={() => openFilteredTab("tasks")}
                            startIcon={<AssignmentIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            TASKS
                        </Button>
                        <Button
                            variant="text" color="inherit"
                            disabled={actionsDisabled}
                            onClick={() => openFilteredTab("projects")}
                            startIcon={<LaunchIcon />}
                            sx={{ fontWeight: "bold" }}
                        >
                            PROJECTS
                        </Button>
                    </Stack>
                </Box>

                {/* 3. TABLE */}
                <Box sx={{ width: "100%" }}>
                    <DataGrid
                        rows={users}
                        columns={columns}
                        getRowId={(row) => row.user_id}
                        checkboxSelection
                        // Deleted / anonymized accounts cannot be updated (the backend
                        // rejects any PATCH on a deleted user), so they can't be selected
                        // for the admin bulk actions.
                        isRowSelectable={(params) => !params.row.deleted}
                        disableRowSelectionExcludeModel
                        disableRowSelectionOnClick
                        loading={loading}
                        rowSelectionModel={selectedUsers}
                        onRowSelectionModelChange={setSelectedUsers}
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

            <CreateUserModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => {
                    refetchUsers();
                    showSnackbar("User created. A validation email has been sent to confirm their address.", "success");
                }}
            />

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={closeSnackbar} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: "100%" }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
