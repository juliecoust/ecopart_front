import { useState, useEffect, useCallback, useRef } from "react";
import { AlertColor } from "@mui/material";
import { GridPaginationModel, GridRowSelectionModel } from "@mui/x-data-grid";
import { searchProjects, searchProjectSamples, deleteProject, Project, SearchFilter } from "../api/projects.api";
import { useAuthStore } from "@/features/auth/store/auth.store";

export const useProjectsTable = () => {
    // State to hold the current authenticated user directly in the hook
    const currentUser = useAuthStore((state) => state.user);

    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(false);
    const [totalRows, setTotalRows] = useState(0);

    const [error, setError] = useState<string | null>(null);

    const [searchText, setSearchText] = useState("");
    const [debouncedSearchText, setDebouncedSearchText] = useState("");

    const [searchAttribute, setSearchAttribute] = useState<string>("project_title");

    // Default to "All" which will now be safely scoped to the user's projects
    const [selectedFilter, setSelectedFilter] = useState<string>("All");

    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 10,
    });

    const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
        type: "include",
        ids: new Set(),
    });

    // Guards the destructive DELETE action while its requests are in flight.
    const [isActionRunning, setIsActionRunning] = useState(false);

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: "",
        severity: "info",
    });

    // Monotonic id identifying the latest fetch. The async sample-count enrichment
    // checks this before applying so a slow count batch can't clobber the rows of a
    // newer search/pagination request.
    const fetchRequestId = useRef(0);

    // Enrich the freshly-fetched projects with their server sample totals.
    // The project-search endpoint does not return a count, so we ask the samples
    // search endpoint for `search_info.total` (limit=1, one lightweight request per row).
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
            // Only override the count when the samples search actually returned a
            // numeric total. A failed request or a response without `search_info`
            // leaves nbr_sample undefined so the grid shows "—" (unknown) rather
            // than a misleading "0".
            const total =
                result.status === "fulfilled" ? result.value.search_info?.total : undefined;
            return typeof total === "number" ? { ...project, nbr_sample: total } : project;
        });

        setProjects(enriched);
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchText(searchText);
        }, 500);
        return () => clearTimeout(timerId);
    }, [searchText]);

    useEffect(() => {
        setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }, [debouncedSearchText, selectedFilter, searchAttribute]);

    const fetchProjects = useCallback(async () => {
        // Guard clause to prevent fetching if the user is not yet loaded into the store
        if (!currentUser) return;

        const requestId = ++fetchRequestId.current;

        setLoading(true);
        setError(null);

        try {
            const activeFilters: SearchFilter[] = [];

            // 1. DYNAMIC ATTRIBUTE SEARCH
            if (debouncedSearchText) {
                if (searchAttribute === "project_id") {
                    // Exact match for numeric project ID
                    const parsed = Number.parseInt(debouncedSearchText, 10);
                    if (!Number.isNaN(parsed)) {
                        activeFilters.push({
                            field: "project_id",
                            operator: "=",
                            value: parsed,
                        });
                    }
                } else {
                    activeFilters.push({
                        field: searchAttribute,
                        operator: "LIKE",
                        value: `%${debouncedSearchText}%`
                    });
                }
            }

            // 2. SECURITY & SCOPING FILTERS
            // We translate the UI selection into backend security queries
            if (selectedFilter === "Manager") {
                // Strictly filter to projects where the user is a manager
                activeFilters.push({
                    field: "managers",
                    operator: "=",
                    value: currentUser.user_id
                });
            } else {
                // For "All" or "Validated", we still restrict visibility to projects 
                // where the user has at least one privilege (Manager, Member, or Contact)
                activeFilters.push({
                    field: "for_managing",
                    operator: "=",
                    value: true
                });

                if (selectedFilter === "Validated") {
                    // Note: Ensure 'qc_state' is added to the backend's allowed filters list
                    activeFilters.push({
                        field: "qc_state",
                        operator: "=",
                        value: "validated"
                    });
                }
            }

            const response = await searchProjects({
                page: paginationModel.page + 1,
                limit: paginationModel.pageSize,
                filters: activeFilters,
                sort_by: "desc(project_id)"
            });

            if (response && response.projects) {
                // Render rows immediately, then backfill the sample counts.
                setProjects(response.projects);
                setTotalRows(response.search_info?.total || 0);
                void enrichWithSampleCounts(response.projects, requestId);
            } else {
                setProjects([]);
                setTotalRows(0);
            }
        } catch (err: unknown) {
            console.error("Failed to fetch projects", err);

            let errorMessage = "Unknown error while fetching projects.";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === "string") {
                errorMessage = err;
            } else if (typeof err === "object" && err !== null) {
                const errorObj = err as Record<string, unknown>;
                if (Array.isArray(errorObj.errors)) {
                    errorMessage = errorObj.errors.join(", ");
                }
            }

            setError(errorMessage);
            setProjects([]);
            setTotalRows(0);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearchText, searchAttribute, selectedFilter, paginationModel.page, paginationModel.pageSize, currentUser, enrichWithSampleCounts]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const closeSnackbar = () => {
        setSnackbar((prev) => ({ ...prev, open: false }));
    };

    /**
     * Delete every project in the current selection (after confirmation).
     *
     * Server-side this is restricted to the project managers (and admins), so a
     * member/contact selection comes back rejected: we keep only the projects
     * that actually failed selected, so a retry targets just those.
     */
    const handleDeleteProjects = async () => {
        if (rowSelectionModel.type === "exclude") {
            console.warn("[Projects] Exclude selection model is disabled for this grid.");
            return;
        }

        const selectedIds = Array.from(rowSelectionModel.ids).map(Number);
        if (selectedIds.length === 0) return;

        if (!window.confirm(
            `Are you sure you want to delete ${selectedIds.length} project(s)? ` +
            `This also removes their samples and any linked EcoTaxa project. This cannot be undone.`,
        )) return;

        setIsActionRunning(true);
        try {
            const results = await Promise.allSettled(
                selectedIds.map((projectId) => deleteProject(projectId)),
            );
            const failedIds = selectedIds.filter((_, index) => results[index].status === "rejected");

            if (failedIds.length === 0) {
                setSnackbar({ open: true, message: "Project(s) deleted.", severity: "success" });
            } else {
                console.error("[Projects] Some deletions failed:", failedIds);
                setSnackbar({
                    open: true,
                    message: "Failed to delete some projects. Only a project manager can delete it.",
                    severity: "error",
                });
            }

            setRowSelectionModel(
                failedIds.length > 0
                    ? { type: "include", ids: new Set<number>(failedIds) }
                    : { type: "include", ids: new Set() },
            );
            fetchProjects();
        } finally {
            setIsActionRunning(false);
        }
    };

    return {
        projects, loading, totalRows,
        error,
        searchText, setSearchText,
        searchAttribute, setSearchAttribute,
        selectedFilter, setSelectedFilter,
        paginationModel, setPaginationModel,
        rowSelectionModel, setRowSelectionModel,
        isActionRunning,
        handleDeleteProjects,
        snackbar, closeSnackbar,
    };
};