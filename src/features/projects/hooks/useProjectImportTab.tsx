import React from "react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertColor } from "@mui/material";
import { GridRowSelectionModel } from "@mui/x-data-grid";

import {
    getProjectById,
    getImportableRawSamples,
    getImportableEcoTaxaSamples,
    getImportableCtdSamples,
    ImportableRawSample,
    ImportableEcoTaxaSample,
    ImportableCtdSample,
    importRawSamples,
    importEcoTaxaSamples,
    importProjectCtdSamples,
    previewSamplesQcGraphs,
    SampleQcGraphs,
    TaskLaunchResponse,
} from "../api/projects.api";

// The preview endpoint rejects the whole batch when any name is not importable, with a message like
// "Samples not importable: a, b". Extract those names (restricted to the ones we actually requested,
// so an unexpected message shape can't inject arbitrary entries).
const parseNotImportableSamples = (error: unknown, requested: string[]): string[] => {
    const message = error instanceof Error ? error.message : String(error);
    const match = /not importable:\s*(.+)/i.exec(message);
    if (!match) return [];
    const listed = match[1].split(",").map((s) => s.trim()).filter(Boolean);
    return requested.filter((name) => listed.includes(name));
};

// The preview endpoint answers with short server-side strings that mean nothing to an operator —
// "Cannot preview sample QC graphs" in particular is its catch-all for ANY unexpected read failure.
// Turn the ones we know into something actionable; anything else is surfaced as-is.
const describeQcPreviewError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : "";

    // Catch-all 500. In practice it means the raw particle data could not be read from the source
    // folder — the sample folder exists (so it is listed as importable) but its particle archive is
    // missing or unreadable, which is exactly what the graphs are computed from.
    if (/cannot preview sample qc graphs/i.test(message)) {
        return "The graphs could not be computed from the project source folder. The raw particle data is most likely missing or unreadable — check that each sample folder holds its particle archive (UVP6: ecodata/<sample>/<sample>_Particule.zip, UVP5: work/<sample>).";
    }
    if (/folder does not exist at path/i.test(message)) {
        return `The project source folder cannot be reached (${message}).`;
    }
    if (/unknown instrument model/i.test(message)) {
        return "The instrument model of this project is not supported by the QC preview (UVP5 and UVP6 only).";
    }
    if (/user cannot be used|cannot access this project/i.test(message)) {
        return "You are not allowed to preview the QC graphs of this project.";
    }
    if (/cannot find project/i.test(message)) {
        return "The project could not be found on the server.";
    }
    if (/session expired/i.test(message)) {
        return "Your session expired — sign in again to load the graphs.";
    }
    return message || "The graphs could not be loaded.";
};

export const useProjectImportTab = (projectId: number) => {
    // --- 1. LOCAL STATE ---

    const [rootFolderPath, setRootFolderPath] = useState<string>("Loading...");

    // Raw (UVP) Samples State
    const [rawSamples, setRawSamples] = useState<ImportableRawSample[]>([]);
    const [loadingRaw, setLoadingRaw] = useState(false);

    const [selectedRawSamples, setSelectedRawSamples] = useState<GridRowSelectionModel>({
        type: "include",
        ids: new Set(),
    });

    // EcoTaxa Samples State
    const [ecoTaxaSamples, setEcoTaxaSamples] = useState<ImportableEcoTaxaSample[]>([]);
    const [loadingEcoTaxa, setLoadingEcoTaxa] = useState(false);
    const [selectedEcoTaxaSamples, setSelectedEcoTaxaSamples] = useState<GridRowSelectionModel>({
        type: "include",
        ids: new Set(),
    });

    // CTD Samples State
    const [ctdSamples, setCtdSamples] = useState<ImportableCtdSample[]>([]);
    const [loadingCtd, setLoadingCtd] = useState(false);
    const [selectedCtdSamples, setSelectedCtdSamples] = useState<GridRowSelectionModel>({
        type: "include",
        ids: new Set(),
    });

    // Track whether the project has an EcoTaxa project linked
    const [hasEcoTaxaProject, setHasEcoTaxaProject] = useState<boolean>(false);

    // Backup Options State 
    const [enableAutoBackup, setEnableAutoBackup] = useState(true);
    const [skipAlreadyImported, setSkipAlreadyImported] = useState(true);

    const [isImporting, setIsImporting] = useState(false);

    // QC Modal State
    const [isQcModalOpen, setIsQcModalOpen] = useState(false);
    const [importAllUvpFlag, setImportAllUvpFlag] = useState(false);
    // Working set for the pre-import QC review: the names that will actually be imported (drives the
    // subtitle count and the import call), plus the graph datasets fetched for each of them.
    const [qcSampleNames, setQcSampleNames] = useState<string[]>([]);
    const [qcPreviews, setQcPreviews] = useState<SampleQcGraphs[]>([]);
    // Names the preview endpoint rejected as not importable: no QC graphs, but still shown so the
    // operator can remove them (they would otherwise fail the whole import).
    const [qcNotImportable, setQcNotImportable] = useState<string[]>([]);
    const [loadingQcPreview, setLoadingQcPreview] = useState(false);
    const [qcPreviewError, setQcPreviewError] = useState<string | null>(null);

    // Notifications
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: React.ReactNode; severity: AlertColor }>({
        open: false, message: "", severity: "info",
    });

    // --- 2. LIFECYCLE & DATA FETCHING ---
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            setLoadingRaw(true);
            setLoadingEcoTaxa(true);
            setLoadingCtd(true);

            try {
                const projectData = await getProjectById(projectId);
                if (isMounted) setRootFolderPath(projectData.root_folder_path || "No path defined");
                // Use ecotaxa_project_id to determine link status, not ecotaxa_project_name
                // (name can be null even if project is linked)
                if (isMounted) setHasEcoTaxaProject(projectData.ecotaxa_project_id != null);

                try {
                    const rawData = await getImportableRawSamples(projectId);
                    if (isMounted) setRawSamples(rawData || []);
                } catch (e) {
                    console.error("Failed to load raw samples", e);
                } finally {
                    if (isMounted) setLoadingRaw(false);
                }

                try {
                    const ecoTaxaData = await getImportableEcoTaxaSamples(projectId);
                    if (isMounted) setEcoTaxaSamples(ecoTaxaData || []);
                } catch (e) {
                    console.error("Failed to load ecotaxa samples (Backend Error expected)", e);
                } finally {
                    if (isMounted) setLoadingEcoTaxa(false);
                }

                try {
                    const ctdData = await getImportableCtdSamples(projectId);
                    if (isMounted) setCtdSamples(ctdData || []);
                } catch (e) {
                    console.error("Failed to load CTD samples", e);
                } finally {
                    if (isMounted) setLoadingCtd(false);
                }

            } catch (error) {
                console.error("Failed to initialize import tab:", error);
                if (isMounted) {
                    setRootFolderPath("Error loading data");
                    setHasEcoTaxaProject(false);
                    setRawSamples([]);
                    setEcoTaxaSamples([]);
                    setCtdSamples([]);
                }
            } finally {
                if (isMounted) {
                    setLoadingRaw(false);
                    setLoadingEcoTaxa(false);
                    setLoadingCtd(false);
                }
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [projectId]);

    // --- 3. ACTIONS ---

    const showSnackbar = (message: React.ReactNode, severity: AlertColor = "info") => setSnackbar({ open: true, message, severity });
    const closeSnackbar = () => setSnackbar(prev => ({ ...prev, open: false }));

    const getSelectionCount = (selectionModel: GridRowSelectionModel, totalRows: number): number => {
        return selectionModel.type === "exclude"
            ? Math.max(totalRows - selectionModel.ids.size, 0)
            : selectionModel.ids.size;
    };

    const getSelectedSampleNames = (
        selectionModel: GridRowSelectionModel,
        allSampleNames: string[],
    ): string[] => {
        if (selectionModel.type === "exclude") {
            const excluded = new Set(Array.from(selectionModel.ids).map(String));
            return allSampleNames.filter((name) => !excluded.has(name));
        }

        return Array.from(selectionModel.ids).map(String);
    };

    /**
     * Maps EcoTaxa sample_id (numeric) to sample_name (string).
     * EcoTaxa samples have sample_id as row ID, but the API expects sample_name.
     */
    const getSelectedEcoTaxaSampleNames = (
        selectionModel: GridRowSelectionModel,
    ): string[] => {
        if (selectionModel.type === "exclude") {
            const excluded = new Set(Array.from(selectionModel.ids).map(Number));
            return ecoTaxaSamples
                .filter((sample) => !excluded.has(sample.sample_id))
                .map((sample) => sample.sample_name);
        }

        const selectedIds = new Set(Array.from(selectionModel.ids).map(Number));
        return ecoTaxaSamples
            .filter((sample) => selectedIds.has(sample.sample_id))
            .map((sample) => sample.sample_name);
    };

    const getSelectedCtdSampleNames = (
        selectionModel: GridRowSelectionModel,
    ): string[] => {
        if (selectionModel.type === "exclude") {
            const excluded = new Set(Array.from(selectionModel.ids).map(String));
            return ctdSamples
                .filter((sample) => !excluded.has(sample.sample_name))
                .map((sample) => sample.sample_name);
        }

        return Array.from(selectionModel.ids).map(String);
    };

    const handlePreImportRawSamples = async (importAll: boolean = false) => {
        const allRawSampleNames = rawSamples.map((s) => s.sample_name);
        const names = importAll
            ? allRawSampleNames
            : getSelectedSampleNames(selectedRawSamples, allRawSampleNames);

        if (names.length === 0) return showSnackbar("No samples to import.", "warning");

        setImportAllUvpFlag(importAll);
        setQcSampleNames(names);
        setQcPreviews([]);
        setQcNotImportable([]);
        setQcPreviewError(null);
        setIsQcModalOpen(true);

        // Fetch the QC graph datasets so the operator can review quality before committing.
        setLoadingQcPreview(true);
        try {
            const previews = await previewSamplesQcGraphs(projectId, names);
            setQcPreviews(previews || []);
        } catch (error) {
            // The endpoint is all-or-nothing: if ANY requested name is not importable it rejects the
            // whole batch. Peel those out so the importable samples still get their QC cards, and show
            // the rest as removable error entries. Any other failure is surfaced as a global warning.
            const notImportable = parseNotImportableSamples(error, names);
            if (notImportable.length > 0) {
                setQcNotImportable(notImportable);
                const importable = names.filter((name) => !notImportable.includes(name));
                if (importable.length > 0) {
                    try {
                        const previews = await previewSamplesQcGraphs(projectId, importable);
                        setQcPreviews(previews || []);
                    } catch (retryError) {
                        console.error("Failed to load QC preview (retry)", retryError);
                        setQcPreviewError(describeQcPreviewError(retryError));
                    }
                }
            } else {
                console.error("Failed to load QC preview", error);
                setQcPreviewError(describeQcPreviewError(error));
            }
        } finally {
            setLoadingQcPreview(false);
        }
    };

    // "REMOVE FROM IMPORT": drop a sample from the working set (import list, graphs and error entries).
    // Emptying the set closes the modal — there is nothing left to import.
    const removeQcSample = (sampleName: string) => {
        const remaining = qcSampleNames.filter((name) => name !== sampleName);
        setQcSampleNames(remaining);
        setQcPreviews((prev) => prev.filter((p) => p.sample_name !== sampleName));
        setQcNotImportable((prev) => prev.filter((name) => name !== sampleName));
        if (remaining.length === 0) {
            setIsQcModalOpen(false);
            showSnackbar("All samples removed — nothing to import.", "info");
        }
    };

    /**
     * Commit the reviewed import. `markValidated` maps to the two footer actions: IMPORT & VALIDATE
     * sends every remaining sample as `validated_samples` (marked VALIDATED at import), while
     * IMPORT & PENDING sends none (they default to PENDING).
     */
    const confirmAndExecuteRawImport = async (markValidated: boolean = false) => {
        setIsQcModalOpen(false);
        setIsImporting(true);

        const samplesToImport = qcSampleNames;

        try {
            const response = await importRawSamples(projectId, {
                samples: samplesToImport,
                validated_samples: markValidated ? samplesToImport : [],
                backup_project: enableAutoBackup,
                backup_project_skip_already_imported: skipAlreadyImported
            });

            // Resolve task_id from different possible response shapes
            const resolvedTaskId: number | undefined =
                response?.task_id ??
                (typeof response?.task_import_samples === 'object'
                    ? (response.task_import_samples as TaskLaunchResponse)?.task_id
                    : undefined);

            if (resolvedTaskId) {
                showSnackbar(
                    <>Import task <Link to={`/projects/${projectId}/tasks/${resolvedTaskId}`} style={{ color: "inherit", fontWeight: "bold", textDecoration: "underline" }}>#{resolvedTaskId}</Link> queued. Check its progress in the <Link to={`/projects/${projectId}/tasks`} style={{ color: "inherit", textDecoration: "underline" }}>TASKS tab</Link>.</>,
                    "success"
                );
            } else if (response?.task_import_samples) {
                const count = typeof response.task_import_samples === 'number' ? response.task_import_samples : '?';
                showSnackbar(
                    <>Import task queued ({count} samples). Check the <Link to={`/projects/${projectId}/tasks`} style={{ color: "inherit", fontWeight: "bold", textDecoration: "underline" }}>TASKS tab</Link>.</>,
                    "success"
                );
            } else {
                showSnackbar(
                    <>Raw samples import completed. Check the <Link to={`/projects/${projectId}/tasks`} style={{ color: "inherit", fontWeight: "bold", textDecoration: "underline" }}>TASKS tab</Link>.</>,
                    "success"
                );
            }

            setSelectedRawSamples({ type: "include", ids: new Set() });

            // Ask tasks list to refresh (some imports create tasks asynchronously)
            try { window.dispatchEvent(new CustomEvent("ecopart:tasks:refresh")); } catch { /* ignore */ }

            const rawData = await getImportableRawSamples(projectId);
            setRawSamples(rawData || []);
        } catch (error) {
            console.error(error);
            showSnackbar("Failed to import raw samples.", "error");
        } finally {
            setIsImporting(false);
        }
    };

    const handleImportEcoTaxaSamples = async (importAll: boolean = false) => {
        if (!hasEcoTaxaProject) return showSnackbar("No EcoTaxa project linked.", "error");

        const samplesToImport = importAll
            ? ecoTaxaSamples.map((s) => s.sample_name)
            : getSelectedEcoTaxaSampleNames(selectedEcoTaxaSamples);

        if (samplesToImport.length === 0) return showSnackbar("No samples to import.", "warning");

        setIsImporting(true);
        try {
            await importEcoTaxaSamples(projectId, {
                samples: samplesToImport,
                backup_project: enableAutoBackup,
                backup_project_skip_already_imported: skipAlreadyImported
            });

            showSnackbar(
                <>EcoTaxa samples import completed successfully. Check the <Link to={`/projects/${projectId}/tasks`} style={{ color: "inherit", fontWeight: "bold", textDecoration: "underline" }}>TASKS tab</Link>.</>,
                "success"
            );

            setSelectedEcoTaxaSamples({ type: "include", ids: new Set() });

            // Ask tasks list to refresh in case backend created an async task
            try { window.dispatchEvent(new CustomEvent("ecopart:tasks:refresh")); } catch { /* ignore */ }

            const ecoData = await getImportableEcoTaxaSamples(projectId);
            setEcoTaxaSamples(ecoData || []);
        } catch (error) {
            console.error(error);
            showSnackbar("Failed to import EcoTaxa samples.", "error");
        } finally {
            setIsImporting(false);
        }
    };

    const handleImportCtdSamples = async (importAll: boolean = false) => {
        const samplesToImport = importAll
            ? ctdSamples.map((sample) => sample.sample_name)
            : getSelectedCtdSampleNames(selectedCtdSamples);

        if (samplesToImport.length === 0) return showSnackbar("No CTD samples to import.", "warning");

        setIsImporting(true);
        try {
            const response = await importProjectCtdSamples(projectId, { samples: samplesToImport });

            if (response?.task_id) {
                showSnackbar(
                    <>CTD import task <Link to={`/projects/${projectId}/tasks/${response.task_id}`} style={{ color: "inherit", fontWeight: "bold", textDecoration: "underline" }}>#{response.task_id}</Link> started. Check its progress in the TASKS tab.</>,
                    "success"
                );
            } else {
                showSnackbar(
                    <>CTD samples import completed. Check the <Link to={`/projects/${projectId}/tasks`} style={{ color: "inherit", fontWeight: "bold", textDecoration: "underline" }}>TASKS tab</Link>.</>,
                    "success"
                );
            }

            setSelectedCtdSamples({ type: "include", ids: new Set() });

            try { window.dispatchEvent(new CustomEvent("ecopart:tasks:refresh")); } catch { /* ignore */ }

            const ctdData = await getImportableCtdSamples(projectId);
            setCtdSamples(ctdData || []);
        } catch (error) {
            console.error(error);
            showSnackbar("Failed to import CTD samples.", "error");
        } finally {
            setIsImporting(false);
        }
    };

    return {
        rootFolderPath,
        rawSamples, loadingRaw, selectedRawSamples, setSelectedRawSamples,
        rawSelectionCount: getSelectionCount(selectedRawSamples, rawSamples.length),

        ecoTaxaSamples, loadingEcoTaxa, selectedEcoTaxaSamples, setSelectedEcoTaxaSamples,
        ecoTaxaSelectionCount: getSelectionCount(selectedEcoTaxaSamples, ecoTaxaSamples.length),

        ctdSamples, loadingCtd, selectedCtdSamples, setSelectedCtdSamples,
        ctdSelectionCount: getSelectionCount(selectedCtdSamples, ctdSamples.length),

        hasEcoTaxaProject,

        enableAutoBackup, setEnableAutoBackup,
        skipAlreadyImported, setSkipAlreadyImported,
        isImporting,

        isQcModalOpen, setIsQcModalOpen, importAllUvpFlag,
        qcSampleNames, qcPreviews, qcNotImportable, loadingQcPreview, qcPreviewError, removeQcSample,

        handlePreImportRawSamples, confirmAndExecuteRawImport, handleImportEcoTaxaSamples, handleImportCtdSamples,
        snackbar, closeSnackbar
    };
};