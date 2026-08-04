import { useState, useEffect, useCallback, useRef } from "react";
import { AlertColor } from "@mui/material";
import { GridPaginationModel, GridRowSelectionModel } from "@mui/x-data-grid";

import { countProjectsForUser, type SearchFilter } from "@/features/projects/api/projects.api";
import { AdminUser, deleteUser, searchUsers, setUserAdmin } from "../api/adminUsers.api";

// Stable default so callers that pass no extra filters don't get a fresh array
// reference every render (which would make `fetchUsers` unstable → refetch loop).
const NO_EXTRA_FILTERS: SearchFilter[] = [];

/**
 * Hook backing the admin USERS tab.
 *
 * Mirrors `useTasksTable`: server-side pagination + debounced attribute search
 * against POST /users/searches, checkbox selection, and a snackbar. Adds the
 * admin bulk action `handleSetAdmin` (grant/revoke admin on the selection).
 *
 * `extraFilters` are merged into every request on top of the attribute search —
 * used to pre-scope the list to a set of user ids (`user_id IN [...]`) when opened
 * from the PROJECTS tab (the members + managers of the selected project(s)). The
 * user search has no project filter, so the caller resolves it to user ids first.
 * Callers must memoize the array so it stays referentially stable across renders.
 */
export const useAdminUsersTable = (extraFilters: SearchFilter[] = NO_EXTRA_FILTERS) => {
    const createEmptySelectionModel = (): GridRowSelectionModel => ({ type: "include", ids: new Set() });

    const getSelectionCount = (selectionModel: GridRowSelectionModel, totalCount: number): number => {
        return selectionModel.type === "exclude"
            ? Math.max(totalCount - selectionModel.ids.size, 0)
            : selectionModel.ids.size;
    };

    const getSelectedUserIds = (selectionModel: GridRowSelectionModel): number[] => {
        if (selectionModel.type === "exclude") {
            console.warn("[Admin Users] Exclude selection model is disabled for this grid.");
            return [];
        }

        return Array.from(selectionModel.ids).map(Number);
    };

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const [searchText, setSearchText] = useState<string>("");
    const [debouncedSearchText, setDebouncedSearchText] = useState<string>("");
    // last_name (Name), email, organisation and country are LIKE attributes;
    // user_id is an exact numeric match.
    const [searchAttribute, setSearchAttribute] = useState<string>("last_name");

    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 10,
    });
    const [selectedUsers, setSelectedUsers] = useState<GridRowSelectionModel>(createEmptySelectionModel());
    const [isActionRunning, setIsActionRunning] = useState<boolean>(false);

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: "",
        severity: "info",
    });

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchText(searchText);
        }, 500);

        return () => clearTimeout(timerId);
    }, [searchText]);

    useEffect(() => {
        setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }, [debouncedSearchText, searchAttribute, extraFilters]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const filters: SearchFilter[] = [];
            if (debouncedSearchText) {
                if (searchAttribute === "user_id") {
                    // user_id is a numeric exact-match column: only accept fully-numeric
                    // input (parseInt would otherwise turn "42abc" into 42).
                    const trimmed = debouncedSearchText.trim();
                    if (/^\d+$/.test(trimmed)) {
                        filters.push({ field: "user_id", operator: "=", value: Number(trimmed) });
                    }
                } else {
                    filters.push({ field: searchAttribute, operator: "LIKE", value: `%${debouncedSearchText}%` });
                }
            }

            const response = await searchUsers({
                page: paginationModel.page + 1,
                limit: paginationModel.pageSize,
                sort_by: "desc(user_id)",
                filters: [...filters, ...extraFilters],
            });

            setUsers(response.users || []);
            setTotalRows(response.search_info?.total || 0);
        } catch (err) {
            console.error("[Admin Users] fetch failed", err);
            setUsers([]);
            setTotalRows(0);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [paginationModel.page, paginationModel.pageSize, debouncedSearchText, searchAttribute, extraFilters]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Per-user manager / member project counts are not part of the user model, so
    // we derive them client-side: one projects search per user and per role, reading
    // only `search_info.total`. This runs after the page of users has loaded and
    // merges the counts back in as they resolve. Keying on the id string (not on
    // `users`) means the count-merge itself doesn't re-trigger the effect, and a ref
    // token discards results from a stale run (page changed / new search) so counts
    // never land on the wrong rows.
    const countsRunId = useRef(0);
    const userIdsKey = users.map((u) => u.user_id).join(",");
    useEffect(() => {
        if (!userIdsKey) return;

        const runId = ++countsRunId.current;
        const userIds = userIdsKey.split(",").map(Number);

        userIds.forEach(async (userId) => {
            try {
                const [managerCount, memberCount] = await Promise.all([
                    countProjectsForUser(userId, "managers"),
                    countProjectsForUser(userId, "members"),
                ]);
                if (runId !== countsRunId.current) return;
                setUsers((prev) =>
                    prev.map((u) =>
                        u.user_id === userId
                            ? { ...u, manager_count: managerCount, member_count: memberCount }
                            : u,
                    ),
                );
            } catch (err) {
                console.warn(`[Admin Users] Failed to load project counts for user ${userId}`, err);
            }
        });
    }, [userIdsKey]);

    const showSnackbar = (message: string, severity: AlertColor = "info") => {
        setSnackbar({ open: true, message, severity });
    };

    const closeSnackbar = () => {
        setSnackbar((prev) => ({ ...prev, open: false }));
    };

    /** Grant (makeAdmin=true) or revoke (false) admin rights on the selection. */
    const handleSetAdmin = async (makeAdmin: boolean) => {
        const selectedIds = getSelectedUserIds(selectedUsers);
        if (selectedIds.length === 0) return;

        const verb = makeAdmin ? "grant admin rights to" : "revoke admin rights from";
        const consequence = makeAdmin
            ? "They will get full administrator access: manage all users, projects and tasks."
            : "They will lose administrator access.";
        if (!window.confirm(
            `Are you sure you want to ${verb} ${selectedIds.length} user(s)? ${consequence}`,
        )) return;

        setIsActionRunning(true);
        try {
            // Attempt every update (a single failure must not abort the rest),
            // then keep only the users that actually failed selected so a retry
            // targets just those.
            const results = await Promise.allSettled(
                selectedIds.map((userId) => setUserAdmin(userId, makeAdmin)),
            );
            const failedIds = selectedIds.filter((_, i) => results[i].status === "rejected");

            if (failedIds.length === 0) {
                showSnackbar(makeAdmin ? "Admin rights granted." : "Admin rights revoked.", "success");
            } else {
                console.error("[Admin Users] Some admin updates failed:", failedIds);
                showSnackbar("Failed to update some users.", "error");
            }

            setSelectedUsers(
                failedIds.length > 0
                    ? { type: "include", ids: new Set<number>(failedIds) }
                    : createEmptySelectionModel(),
            );
            fetchUsers();
        } finally {
            setIsActionRunning(false);
        }
    };

    /** Delete (deactivate) every user in the current selection, after confirmation. */
    const handleDeleteUsers = async () => {
        const selectedIds = getSelectedUserIds(selectedUsers);
        if (selectedIds.length === 0) return;

        if (!window.confirm(
            `Are you sure you want to delete ${selectedIds.length} user account(s)? ` +
            `The account(s) will be deactivated and can no longer sign in.`,
        )) return;

        setIsActionRunning(true);
        try {
            // Attempt every deletion (a single failure must not abort the rest),
            // then keep only the users that actually failed selected so a retry
            // targets just those.
            const results = await Promise.allSettled(
                selectedIds.map((userId) => deleteUser(userId)),
            );
            const failedIds = selectedIds.filter((_, i) => results[i].status === "rejected");

            if (failedIds.length === 0) {
                showSnackbar("User account(s) deleted.", "success");
            } else {
                console.error("[Admin Users] Some deletions failed:", failedIds);
                showSnackbar("Failed to delete some users.", "error");
            }

            setSelectedUsers(
                failedIds.length > 0
                    ? { type: "include", ids: new Set<number>(failedIds) }
                    : createEmptySelectionModel(),
            );
            fetchUsers();
        } finally {
            setIsActionRunning(false);
        }
    };

    return {
        users,
        loading,
        totalRows,
        error,
        paginationModel,
        setPaginationModel,
        selectedUsers,
        setSelectedUsers,
        selectedUserIds: getSelectedUserIds(selectedUsers),
        selectionCount: getSelectionCount(selectedUsers, totalRows),
        searchText,
        setSearchText,
        searchAttribute,
        setSearchAttribute,
        isActionRunning,
        handleSetAdmin,
        handleDeleteUsers,
        refetchUsers: fetchUsers,
        showSnackbar,
        snackbar,
        closeSnackbar,
    };
};
