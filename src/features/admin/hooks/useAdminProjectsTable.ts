import { useState, useEffect, useCallback, useRef } from "react";
import { AlertColor } from "@mui/material";
import { GridPaginationModel, GridRowSelectionModel } from "@mui/x-data-grid";

import {
    Project,
    SearchFilter,
    searchProjects,
    searchProjectSamples,
    deleteProject,
} from "@/features/projects/api/projects.api";

// Stable default so callers that pass no extra filters don't get a fresh array
// reference every render (which would make `fetchProjects` unstable → refetch loop).
const NO_EXTRA_FILTERS: SearchFilter[] = [];

/**
 * Hook backing the admin PROJECTS tab.
 *
 * Mirrors `useAdminUsersTable`: server-side pagination + debounced attribute
 * search against POST /projects/searches, checkbox selection, and a snackbar.
 *
 * Unlike the user-facing `useProjectsTable`, it deliberately omits the
 * `for_managing` scoping filter: the backend project search is unscoped by
 * default, so an admin sees EVERY project. Rows are enriched with their sample
 * totals the same way (one lightweight samples search per row), and it adds the
 * `handleDeleteProjects` bulk action (DELETE /projects/:id/).
 *
 * `extraFilters` are merged into every request on top of the attribute search —
 * used to pre-scope the list to a set of user ids (granted_users → projects where
 * the user is manager OR member) when opened from the admin USERS tab. Callers
 * must memoize the array so it stays referentially stable across renders.
 */
export const useAdminProjectsTable = (extraFilters: SearchFilter[] = NO_EXTRA_FILTERS) => {
    const createEmptySelectionModel = (): GridRowSelectionModel => ({ type: "include", ids: new Set() });

    const getSelectionCount = (selectionModel: GridRowSelectionModel, totalCount: number): number => {
        return selectionModel.type === "exclude"
            ? Math.max(totalCount - selectionModel.ids.size, 0)
            : selectionModel.ids.size;
    };

    const getSelectedProjectIds = (selectionModel: GridRowSelectionModel): number[] => {
        if (selectionModel.type === "exclude") {
            console.warn("[Admin Projects] Exclude selection model is disabled for this grid.");
            return [];
        }

        return Array.from(selectionModel.ids).map(Number);
    };

    const [projects, setProjects] = useState<Project[]>([]);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const [searchText, setSearchText] = useState<string>("");
    const [debouncedSearchText, setDebouncedSearchText] = useState<string>("");
    // project_title, project_acronym, instrument_model, ... are LIKE attributes.
    // project_id, managers and members are numeric exact matches: the backend
    // resolves managers/members to the projects where that user id has the
    // privilege (operator "=", numeric value — see search-projects.ts).
    const [searchAttribute, setSearchAttribute] = useState<string>("project_title");

    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 10,
    });
    const [selectedProjects, setSelectedProjects] = useState<GridRowSelectionModel>(createEmptySelectionModel());
    const [isActionRunning, setIsActionRunning] = useState<boolean>(false);

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: "",
        severity: "info",
    });

    // Monotonic id identifying the latest fetch. The async sample-count enrichment
    // checks this before applying so a slow count batch can't clobber the rows of a
    // newer search/pagination request.
    const fetchRequestId = useRef(0);

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchText(searchText);
        }, 500);

        return () => clearTimeout(timerId);
    }, [searchText]);

    useEffect(() => {
        setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }, [debouncedSearchText, searchAttribute, extraFilters]);

    // Backfill each project with its server sample total. The project-search
    // endpoint does not return a count, so we ask the samples search endpoint for
    // `search_info.total` (limit=1, one lightweight request per row).
    const enrichWithSampleCounts = useCallback(async (baseProjects: Project[], requestId: number) => {
        if (baseProjects.length === 0) return;

        const results = await Promise.allSettled(
            baseProjects.map((project) =>
                searchProjectSamples(project.project_id, { page: 1, limit: 1, filters: [] }),
            ),
        );

        // Drop the result if a newer fetch has started in the meantime.
        if (requestId !== fetchRequestId.current) return;

        const enriched = baseProjects.map((project, index) => {
            const result = results[index];
            const total =
                result.status === "fulfilled" ? result.value.search_info?.total : undefined;
            return typeof total === "number" ? { ...project, nbr_sample: total } : project;
        });

        setProjects(enriched);
    }, []);

    const fetchProjects = useCallback(async () => {
        const requestId = ++fetchRequestId.current;

        setLoading(true);
        setError(null);
        try {
            const NUMERIC_ATTRIBUTES = new Set(["project_id", "managers", "members"]);

            const filters: SearchFilter[] = [];
            if (debouncedSearchText) {
                if (NUMERIC_ATTRIBUTES.has(searchAttribute)) {
                    // Numeric exact-match columns: only accept fully-numeric input (the
                    // backend rejects a non-number managers/members value, and parseInt
                    // would otherwise turn "42abc" into 42). Non-numeric input sends no
                    // filter, leaving the unfiltered list in place.
                    const trimmed = debouncedSearchText.trim();
                    if (/^\d+$/.test(trimmed)) {
                        filters.push({ field: searchAttribute, operator: "=", value: Number(trimmed) });
                    }
                } else {
                    filters.push({ field: searchAttribute, operator: "LIKE", value: `%${debouncedSearchText}%` });
                }
            }

            const response = await searchProjects({
                page: paginationModel.page + 1,
                limit: paginationModel.pageSize,
                sort_by: "desc(project_id)",
                filters: [...filters, ...extraFilters],
            });

            // Render rows immediately, then backfill the sample counts.
            setProjects(response.projects || []);
            setTotalRows(response.search_info?.total || 0);
            void enrichWithSampleCounts(response.projects || [], requestId);
        } catch (err) {
            console.error("[Admin Projects] fetch failed", err);
            setProjects([]);
            setTotalRows(0);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [paginationModel.page, paginationModel.pageSize, debouncedSearchText, searchAttribute, extraFilters, enrichWithSampleCounts]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const showSnackbar = (message: string, severity: AlertColor = "info") => {
        setSnackbar({ open: true, message, severity });
    };

    const closeSnackbar = () => {
        setSnackbar((prev) => ({ ...prev, open: false }));
    };

    /** Delete every project in the current selection (after confirmation). */
    const handleDeleteProjects = async () => {
        const selectedIds = getSelectedProjectIds(selectedProjects);
        if (selectedIds.length === 0) return;

        if (!window.confirm(
            `Are you sure you want to delete ${selectedIds.length} project(s)? ` +
            `This also removes their samples and any linked EcoTaxa project. This cannot be undone.`,
        )) return;

        setIsActionRunning(true);
        try {
            // Attempt every delete (a single failure must not abort the rest),
            // then keep only the projects that actually failed selected so a retry
            // targets just those.
            const results = await Promise.allSettled(
                selectedIds.map((projectId) => deleteProject(projectId)),
            );
            const failedIds = selectedIds.filter((_, i) => results[i].status === "rejected");

            if (failedIds.length === 0) {
                showSnackbar("Project(s) deleted.", "success");
            } else {
                console.error("[Admin Projects] Some deletions failed:", failedIds);
                showSnackbar("Failed to delete some projects.", "error");
            }

            setSelectedProjects(
                failedIds.length > 0
                    ? { type: "include", ids: new Set<number>(failedIds) }
                    : createEmptySelectionModel(),
            );
            fetchProjects();
        } finally {
            setIsActionRunning(false);
        }
    };

    return {
        projects,
        loading,
        totalRows,
        error,
        paginationModel,
        setPaginationModel,
        selectedProjects,
        setSelectedProjects,
        selectedProjectIds: getSelectedProjectIds(selectedProjects),
        selectionCount: getSelectionCount(selectedProjects, totalRows),
        searchText,
        setSearchText,
        searchAttribute,
        setSearchAttribute,
        isActionRunning,
        handleDeleteProjects,
        snackbar,
        closeSnackbar,
    };
};
