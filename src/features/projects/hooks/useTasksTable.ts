import { useState, useEffect, useCallback } from "react";
import { AlertColor } from "@mui/material";
import { GridPaginationModel, GridRowSelectionModel } from "@mui/x-data-grid";

import { deleteProjectTask, downloadTaskFile, SearchFilter, searchProjectTasks, Task } from "../api/projects.api";

// Stable default so callers that pass no extra filters don't get a fresh array
// reference every render (which would make `fetchTasks` unstable → refetch loop).
const NO_EXTRA_FILTERS: SearchFilter[] = [];

/**
 * Hook backing the global Tasks page (`/tasks`).
 *
 * Unlike `useProjectTasksTab`, it does NOT scope the search to a single project:
 * it calls `searchProjectTasks` WITHOUT `projectId` and WITHOUT a `for_managing`
 * filter, so the backend's own `applyUserCanGetFilter` restricts the result to
 * tasks of the projects the current user has access to (admins see everything).
 *
 * `extraFilters` are merged into every request on top of the attribute search —
 * used by the admin TASKS tab to pre-scope the list to a set of user ids
 * (task_owner_id) when opened from the USERS tab. Callers must memoize the array
 * so it stays referentially stable across renders.
 */
export const useTasksTable = (extraFilters: SearchFilter[] = NO_EXTRA_FILTERS) => {
    const createEmptySelectionModel = (): GridRowSelectionModel => ({ type: "include", ids: new Set() });

    const getSelectionCount = (selectionModel: GridRowSelectionModel, totalCount: number): number => {
        return selectionModel.type === "exclude"
            ? Math.max(totalCount - selectionModel.ids.size, 0)
            : selectionModel.ids.size;
    };

    const getSelectedTaskIds = (selectionModel: GridRowSelectionModel): number[] => {
        if (selectionModel.type === "exclude") {
            console.warn("[Tasks Page] Exclude selection model is disabled for this grid.");
            return [];
        }

        return Array.from(selectionModel.ids).map(Number);
    };

    const [tasks, setTasks] = useState<Task[]>([]);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const [searchText, setSearchText] = useState<string>("");
    const [debouncedSearchText, setDebouncedSearchText] = useState<string>("");
    // task_status (resolved via its label) and task_id (exact) are fully supported by
    // the backend task search. task_type (Label) and task_owner (Owner) are also offered
    // as LIKE attributes, but they only match once the backend filter bugs are fixed
    // (task_type filters on the id instead of the label; task_owner has no SQL column).
    const [searchAttribute, setSearchAttribute] = useState<string>("task_status");

    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 10,
    });
    const [selectedTasks, setSelectedTasks] = useState<GridRowSelectionModel>(createEmptySelectionModel());
    const [isActionRunning, setIsActionRunning] = useState<boolean>(false);
    const [downloadingTaskId, setDownloadingTaskId] = useState<number | null>(null);

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

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const filters: SearchFilter[] = [];
            if (debouncedSearchText) {
                if (searchAttribute === "task_id") {
                    // task_id is a numeric exact-match column: only accept fully-numeric
                    // input (parseInt would otherwise turn "42abc" into 42).
                    const trimmed = debouncedSearchText.trim();
                    if (/^\d+$/.test(trimmed)) {
                        filters.push({ field: "task_id", operator: "=", value: Number(trimmed) });
                    }
                } else {
                    // task_status is resolved server-side via its label (LIKE, case-insensitive).
                    filters.push({ field: searchAttribute, operator: "LIKE", value: `%${debouncedSearchText}%` });
                }
            }

            // No projectId and no for_managing: the backend scopes the result to the
            // current user's accessible projects (applyUserCanGetFilter).
            const response = await searchProjectTasks({
                page: paginationModel.page + 1,
                limit: paginationModel.pageSize,
                sort_by: "desc(task_id)",
                filters: [...filters, ...extraFilters],
            });

            setTasks(response.tasks || []);
            setTotalRows(response.search_info?.total || 0);
        } catch (err) {
            console.error("[Tasks Page] fetch failed", err);
            setTasks([]);
            setTotalRows(0);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [paginationModel.page, paginationModel.pageSize, debouncedSearchText, searchAttribute, extraFilters]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    useEffect(() => {
        const handler = () => fetchTasks();
        window.addEventListener("ecopart:tasks:refresh", handler);
        return () => window.removeEventListener("ecopart:tasks:refresh", handler);
    }, [fetchTasks]);

    const showSnackbar = (message: string, severity: AlertColor = "info") => {
        setSnackbar({ open: true, message, severity });
    };

    const closeSnackbar = () => {
        setSnackbar((prev) => ({ ...prev, open: false }));
    };

    const handleDeleteTasks = async () => {
        const selectedIds = getSelectedTaskIds(selectedTasks);
        if (selectedIds.length === 0) return;

        if (!window.confirm(
            `Are you sure you want to delete ${selectedIds.length} task(s)? ` +
            `This removes the selected background tasks and their logs. ` +
            `It does not undo work a completed task already performed. This cannot be undone.`,
        )) return;

        setIsActionRunning(true);
        try {
            // Attempt every deletion (a single failure must not abort the rest),
            // then keep only the tasks that actually failed selected so a retry
            // targets just those instead of re-deleting already-removed ids.
            const results = await Promise.allSettled(
                selectedIds.map((taskId) => deleteProjectTask(taskId)),
            );
            const failedIds = selectedIds.filter((_, i) => results[i].status === "rejected");

            if (failedIds.length === 0) {
                showSnackbar("Selected tasks removed successfully.", "success");
            } else {
                console.error("[Tasks Page] Some deletions failed:", failedIds);
                showSnackbar("Failed to clean up some server tasks.", "error");
            }

            setSelectedTasks(
                failedIds.length > 0
                    ? { type: "include", ids: new Set<number>(failedIds) }
                    : createEmptySelectionModel(),
            );
            // Always refetch so the grid reflects what was really removed.
            fetchTasks();
        } finally {
            setIsActionRunning(false);
        }
    };

    const handleDownloadTaskFile = async (taskId: number) => {
        setDownloadingTaskId(taskId);
        try {
            await downloadTaskFile(taskId);
        } catch (err) {
            console.error("[Tasks Page] Download failed:", err);
            showSnackbar(
                err instanceof Error ? err.message : "Failed to download the export file.",
                "error",
            );
        } finally {
            setDownloadingTaskId(null);
        }
    };

    return {
        tasks,
        loading,
        totalRows,
        error,
        paginationModel,
        setPaginationModel,
        selectedTasks,
        setSelectedTasks,
        selectionCount: getSelectionCount(selectedTasks, totalRows),
        searchText,
        setSearchText,
        searchAttribute,
        setSearchAttribute,
        isActionRunning,
        handleDeleteTasks,
        downloadingTaskId,
        handleDownloadTaskFile,
        snackbar,
        closeSnackbar,
    };
};
