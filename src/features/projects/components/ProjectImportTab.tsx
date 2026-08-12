import React from "react";
import {
    Box, Typography, Button, Switch, FormControlLabel,
    TextField, Divider, Snackbar, Alert, AlertTitle, InputAdornment, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";

import { createEcopartTheme, ecotaxaColors } from "@/theme";
import SectionCard from "@/shared/components/SectionCard";
import InfoTooltip from "@/shared/components/InfoTooltip";

import { useProjectImportTab } from "../hooks/useProjectImportTab";
import { ImportableRawSample, ImportableCtdSample } from "../api/projects.api";
import { QcSampleCard } from "./QcSampleCard";

interface ProjectImportTabProps {
    projectId: number;
}

// What a sample import does and which data/options apply (user terms, no server internals).
const sampleImportInfoContent = (
    <Box>
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
            Imports the selected samples into the project. A sample can only be imported if its
            source data is present and passes basic quality checks; any missing or invalid sample
            stops the import (nothing is imported).
        </Typography>
        <Typography variant="caption" component="p" sx={{ fontWeight: 600 }}>
            What is imported, per instrument:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li>
                <strong>UVP5:</strong> for each sample, the processed cast data plus its metadata
                and configuration (instrument header, cruise info, UVP5 settings, install configuration).
            </li>
            <li>
                <strong>UVP6:</strong> for each sample, the particle data and the images/vignettes.
            </li>
        </Box>
        <Typography variant="caption" component="p" sx={{ mt: 1, fontWeight: 600 }}>
            Options:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li>
                In the import QC preview, confirm with <strong>"Import &amp; validate"</strong> to mark
                the reviewed samples as visually QC-validated right away, or <strong>"Import &amp; pending"</strong>
                {" "}to leave them pending.
            </li>
            <li>
                <strong>"Enable automatic backup of the raw project at every import":</strong> also run a
                project backup once the import succeeds (skipped if the import fails).
            </li>
            <li>
                <strong>"Skip already imported":</strong> incremental toggle for that backup. On: only new
                raw acquisitions are added. Off: everything is backed up again.
            </li>
        </Box>
    </Box>
);

// What a CTD import does (attaches CTD files to existing samples; no backup, no options).
const ctdImportInfoContent = (
    <Box>
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
            Attaches CTD (hydrological cast) files to samples that already exist in the project. It
            does not re-import the samples themselves and does not run a backup.
        </Typography>
        <Typography variant="caption" component="p" sx={{ fontWeight: 600 }}>
            What is imported:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li>
                For each selected sample, its CTD file (provided alongside the acquisition data) is
                added to the sample. UVP5 and UVP6 datasets store these files in their respective CTD folders.
            </li>
        </Box>
        <Typography variant="caption" component="p" sx={{ mt: 1 }}>
            A CTD file can be imported only if it is present and valid for the sample (correct format,
            expected columns); otherwise the import stops. No options.
        </Typography>
    </Box>
);

// What an EcoTaxa import does (sends validated samples to the linked EcoTaxa instance).
const ecoTaxaImportInfoContent = (
    <Box>
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
            Sends the selected samples (images and classification file) to the project's linked EcoTaxa
            instance. It works on samples already imported into the project.
        </Typography>
        <Typography variant="caption" component="p" sx={{ fontWeight: 600 }}>
            Requirements:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li>
                Only samples that have passed visual QC (status VALIDATED) can be sent to EcoTaxa; any
                non-validated sample stops the import (nothing is sent).
            </li>
        </Box>
        <Typography variant="caption" component="p" sx={{ mt: 1, fontWeight: 600 }}>
            Options:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li>
                <strong>"Enable automatic backup of the raw project at every import":</strong> also run a
                project backup once the import succeeds (skipped if the import fails).
            </li>
            <li>
                <strong>"Skip already imported":</strong> incremental toggle for that backup. On: only new
                raw acquisitions are added. Off: everything is backed up again.
            </li>
        </Box>
    </Box>
);

/**
 * The QC modal is a dense read-at-a-glance screen (four graphs plus their metadata per sample), so
 * all of its text runs 20% larger than the rest of the app. Built once at module level rather than
 * per render, and applied to the whole dialog — including the charts, whose axis and tick labels
 * come from the theme's `body1`/`caption`.
 */
const qcModalTheme = createEcopartTheme(1.2);

/**
 * Slack (px) left between the scroll position and the bottom of the QC dialog for the review to
 * count as complete — sub-pixel rounding and the last card's margin would otherwise make the exact
 * bottom unreachable.
 */
const QC_SCROLL_BOTTOM_TOLERANCE_PX = 24;

export const ProjectImportTab: React.FC<ProjectImportTabProps> = ({ projectId }) => {
    const {
        rootFolderPath,
        rawSamples, loadingRaw, selectedRawSamples, setSelectedRawSamples, rawSelectionCount,
        ecoTaxaSamples, loadingEcoTaxa, selectedEcoTaxaSamples, setSelectedEcoTaxaSamples, ecoTaxaSelectionCount,
        ctdSamples, loadingCtd, selectedCtdSamples, setSelectedCtdSamples, ctdSelectionCount,
        enableAutoBackup, setEnableAutoBackup,
        skipAlreadyImported, setSkipAlreadyImported,
        isImporting,
        isQcModalOpen, setIsQcModalOpen,
        qcSampleNames, qcPreviews, qcNotImportable, loadingQcPreview, qcPreviewError, removeQcSample,
        handlePreImportRawSamples, confirmAndExecuteRawImport, handleImportEcoTaxaSamples, handleImportCtdSamples,
        snackbar, closeSnackbar, hasEcoTaxaProject
    } = useProjectImportTab(projectId);

    const ecoProjectLinked = hasEcoTaxaProject;
    const ecoTaxaActionsDisabled = !ecoProjectLinked;

    /**
     * The QC dialog is a *review* screen: the import actions stay locked until the operator has
     * scrolled through every graph, i.e. reached the bottom of the scrollable content. It is a
     * one-way latch — once the bottom has been seen, scrolling back up (or removing a sample, which
     * makes the content scrollable again) must not re-lock the buttons. The latch is reset when the
     * dialog opens or while the preview is (re)loading, so a new set of samples is reviewed afresh.
     */
    const qcScrollRef = React.useRef<HTMLDivElement | null>(null);
    const qcContentRef = React.useRef<HTMLDivElement | null>(null);
    const [qcFullyReviewed, setQcFullyReviewed] = React.useState(false);

    const updateQcScrollState = React.useCallback(() => {
        const el = qcScrollRef.current;
        if (!el) return;
        // Content that fits without a scrollbar satisfies this immediately: there is nothing left to
        // scroll to, so nothing left to review.
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= QC_SCROLL_BOTTOM_TOLERANCE_PX;
        if (atBottom) setQcFullyReviewed(true);
    }, []);

    React.useEffect(() => {
        if (!isQcModalOpen || loadingQcPreview) {
            setQcFullyReviewed(false);
            return;
        }
        // The charts mount asynchronously (MUI X measures its container first), so the content keeps
        // growing after this effect runs: watch it and re-evaluate instead of measuring only once.
        updateQcScrollState();
        const content = qcContentRef.current;
        if (!content || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(updateQcScrollState);
        observer.observe(content);
        return () => observer.disconnect();
    }, [isQcModalOpen, loadingQcPreview, qcPreviews, qcNotImportable, updateQcScrollState]);

    // Import is blocked while the preview is loading, nothing is selected, an import is in flight,
    // any sample in the working set is not importable (it would fail the whole backend import), or
    // the graphs have not been scrolled through yet.
    const importActionsDisabled =
        loadingQcPreview || qcSampleNames.length === 0 || isImporting || qcNotImportable.length > 0 || !qcFullyReviewed;

    // --- DATAGRID COLUMNS DEFINITIONS ---
    const rawSamplesColumns: GridColDef<ImportableRawSample>[] = [
        {
            field: "qc_lvl1",
            headerName: "QC",
            width: 60,
            renderCell: (params: GridRenderCellParams<ImportableRawSample>) => {
                if (params.row.qc_lvl1 === undefined) return null;
                return params.row.qc_lvl1 ? (
                    <Tooltip title="Data valid">
                        <CheckCircleIcon color="success" fontSize="small" />
                    </Tooltip>
                ) : (
                    <Tooltip title={params.row.qc_lvl1_comment || "Data invalid"}>
                        <ErrorIcon color="error" fontSize="small" />
                    </Tooltip>
                );
            },
        },
        { field: "sample_name", headerName: "Name", flex: 1.5, minWidth: 150 },
        { field: "raw_file_name", headerName: "Raw file name", flex: 1.5, minWidth: 150, valueGetter: (_value, row) => row.raw_file_name ?? "Cell" },
        { field: "station_id", headerName: "Station ID", flex: 1, minWidth: 100, valueGetter: (_value, row) => row.station_id ?? "Cell" },
        { field: "first_image", headerName: "First image frame", flex: 1, minWidth: 100, valueGetter: (_value, row) => row.first_image ?? "Cell" },
        { field: "last_image", headerName: "Last image frame", flex: 1, minWidth: 100, valueGetter: (_value, row) => row.last_image ?? "Cell" },
        {
            field: "images_count",
            headerName: "Images",
            flex: 0.8,
            minWidth: 100,
            renderCell: (params: GridRenderCellParams<ImportableRawSample>) => {
                const first = params.row.first_image;
                const last = params.row.last_image;

                // Both values present and numeric -> compute count
                if (typeof first === 'number' && typeof last === 'number') {
                    const count = Math.max(0, last - first + 1);
                    if (count === 0) {
                        return (
                            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Tooltip title="No images">
                                    <ErrorIcon color="error" fontSize="small" />
                                </Tooltip>
                            </Box>
                        );
                    }

                    return (
                        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography sx={{ textAlign: 'center', width: '100%' }}>{count}</Typography>
                        </Box>
                    );
                }

                // If either is missing treat as no images
                return (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Tooltip title="No images">
                            <ErrorIcon color="error" fontSize="small" />
                        </Tooltip>
                    </Box>
                );
            },
        },
        { field: "comment", headerName: "Comment", flex: 2, minWidth: 150, valueGetter: (_value, row) => row.comment ?? "Cell" },
    ];

    const ecoTaxaSamplesColumns: GridColDef[] = [
        { field: "sample_name", headerName: "Sample name", flex: 2, minWidth: 200 },
        { field: "tsv_file_name", headerName: "TSV file name", flex: 2, minWidth: 200 },
        {
            field: "images",
            headerName: "Images",
            flex: 1,
            minWidth: 100,
            renderCell: (params: GridRenderCellParams) => {
                const images = params.row.images;

                // If no images or zero, show error icon
                if (images === undefined || images === null || images === 0) {
                    return (
                        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Tooltip title="No images">
                                <ErrorIcon color="error" fontSize="small" />
                            </Tooltip>
                        </Box>
                    );
                }

                // Otherwise show the number
                return (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography sx={{ textAlign: 'center', width: '100%' }}>{images}</Typography>
                    </Box>
                );
            },
        },
    ];

    const ctdSamplesColumns: GridColDef[] = [
        { field: "sample_name", headerName: "Sample name", flex: 2, minWidth: 180 },
        { field: "ctd_sample_id", headerName: "CTD sample ID", flex: 1.5, minWidth: 160, valueGetter: (_value, row) => row.ctd_sample_id ?? row.sample_name },
        { field: "file_extension", headerName: "File extension", flex: 1, minWidth: 120, valueGetter: (_value, row) => row.file_extension ?? "ctd" },
        { field: "station_id", headerName: "Station ID", flex: 1, minWidth: 120, valueGetter: (_value, row) => row.station_id ?? "N/A" },
    ];

    // --- PIXEL PERFECT STYLING ---
    const dataGridStyles = {
        border: 'none',
        borderBottom: `1px solid ${ecotaxaColors.stone[200]}`,
        borderRadius: 0,
        '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#ffffff',
            borderTop: 'none',
            borderBottom: `1px solid ${ecotaxaColors.stone[200]}`,
            minHeight: '48px !important',
            maxHeight: '48px !important',
            color: 'text.secondary',
            fontWeight: 'normal',
        },
        '& .MuiDataGrid-cell': { borderBottom: 'none' },
        '& .MuiDataGrid-row:nth-of-type(even)': { backgroundColor: ecotaxaColors.stone[50] },
        '& .MuiDataGrid-row.Mui-selected': {
            backgroundColor: ecotaxaColors.secondblue[100],
            '&:hover': { backgroundColor: ecotaxaColors.secondblue[200] }
        },
        '& .MuiCheckbox-root': { color: ecotaxaColors.stone[400] },
        '& .Mui-checked': { color: `${ecotaxaColors.secondblue[600]} !important` },
        '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${ecotaxaColors.stone[200]}`, minHeight: '40px' }
    };

    const renderSelectionBar = (count: number, onImport: () => void, disabled: boolean, isEcoTaxa: boolean = false) => (
        <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: 'grey.100', p: 1.5, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider'
        }}>
            <Typography variant="body2" fontWeight="bold">
                {count} items selected
            </Typography>
            <Button
                variant="text"
                color="inherit"
                disabled={disabled}
                onClick={onImport}
                startIcon={isEcoTaxa ? <CloudUploadIcon /> : <AddIcon />}
                sx={{ fontWeight: 'bold', color: 'text.primary', '&.Mui-disabled': { color: 'text.disabled' } }}
            >
                {isEcoTaxa ? "IMPORT SELECTION IN ECOTAXA" : "IMPORT SELECTION"}
            </Button>
        </Box>
    );

    const renderEmptyState = (message: string) => (
        <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 3, textAlign: 'center', color: 'text.secondary', mb: 2 }}>
            {message}
        </Box>
    );

    return (
        <>
            <SectionCard>
                <Box sx={{ mb: 6 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5, position: 'relative', top: '10px', backgroundColor: 'white', px: 0.5, zIndex: 1 }}>
                        Root folder path*
                    </Typography>
                    <TextField
                        fullWidth
                        value={rootFolderPath}
                        disabled
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <FolderOpenIcon color="disabled" />
                                </InputAdornment>
                            ),
                        }}
                        size="small"
                        sx={{ '& .Mui-disabled': { WebkitTextFillColor: 'rgba(0, 0, 0, 0.6) !important' } }}
                    />
                </Box>

                {/* 2. NEW UVP SAMPLES */}
                <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Box>
                            <Typography variant="h6">
                                New UVP samples
                                <InfoTooltip title={sampleImportInfoContent} />
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            color="inherit"
                            disabled={rawSamples.length === 0 || isImporting}
                            onClick={() => handlePreImportRawSamples(true)}
                            sx={{ borderColor: 'divider', color: 'text.secondary' }}
                        >
                            IMPORT ALL
                        </Button>
                    </Box>

                    {/* MENTOR FIX: Updated empty state text to "0 samples found." */}
                    {rawSamples.length === 0 ? (
                        renderEmptyState(loadingRaw ? "Loading samples..." : "0 samples found.")
                    ) : (
                        <Box sx={{ width: '100%', mb: 1 }}>
                            {renderSelectionBar(rawSelectionCount, () => handlePreImportRawSamples(false), rawSelectionCount === 0 || isImporting)}
                            <DataGrid
                                rows={rawSamples}
                                columns={rawSamplesColumns}
                                getRowId={(row) => row.sample_name}
                                checkboxSelection
                                disableRowSelectionExcludeModel
                                disableRowSelectionOnClick
                                isRowSelectable={(params) => params.row.qc_lvl1 !== false}
                                loading={loadingRaw}
                                rowSelectionModel={selectedRawSamples}
                                onRowSelectionModelChange={(newSelection) => setSelectedRawSamples(newSelection)}
                                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                                pageSizeOptions={[5, 10, 25, 50, 100, { value: Math.max(rawSamples.length, 1), label: "All" }]}
                                autoHeight
                                sx={dataGridStyles}
                            />
                        </Box>
                    )}
                </Box>

                <Divider sx={{ my: 4 }} />

                {/* 4. NEW CTD SAMPLES */}
                <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Box>
                            <Typography variant="h6">
                                New CTD samples
                                <InfoTooltip title={ctdImportInfoContent} />
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            color="inherit"
                            disabled={ctdSamples.length === 0 || isImporting}
                            onClick={() => handleImportCtdSamples(true)}
                            sx={{ borderColor: 'divider', color: 'text.secondary' }}
                        >
                            IMPORT ALL
                        </Button>
                    </Box>

                    {ctdSamples.length === 0 ? (
                        renderEmptyState(loadingCtd ? "Loading CTD samples..." : "0 samples found.")
                    ) : (
                        <Box sx={{ width: '100%', mb: 1 }}>
                            {renderSelectionBar(ctdSelectionCount, () => handleImportCtdSamples(false), ctdSelectionCount === 0 || isImporting)}
                            <DataGrid<ImportableCtdSample>
                                rows={ctdSamples}
                                columns={ctdSamplesColumns}
                                getRowId={(row) => row.sample_name}
                                checkboxSelection
                                disableRowSelectionExcludeModel
                                disableRowSelectionOnClick
                                loading={loadingCtd}
                                rowSelectionModel={selectedCtdSamples}
                                onRowSelectionModelChange={(newSelection) => setSelectedCtdSamples(newSelection)}
                                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                                pageSizeOptions={[5, 10, 25, 50, 100, { value: Math.max(ctdSamples.length, 1), label: "All" }]}
                                autoHeight
                                sx={dataGridStyles}
                            />
                        </Box>
                    )}
                </Box>

                <Divider sx={{ my: 4 }} />

                {/* 5. BACKUP OPTIONS */}
                <Box sx={{ mb: 4 }}>
                    <FormControlLabel
                        control={<Switch checked={enableAutoBackup} onChange={(e) => setEnableAutoBackup(e.target.checked)} disabled={isImporting} />}
                        label="Enable automatic backup of the raw project at every import"
                    />

                    <Box sx={{ ml: 4, mt: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">Options</Typography>
                        <FormControlLabel
                            control={<Switch checked={skipAlreadyImported} onChange={(e) => setSkipAlreadyImported(e.target.checked)} disabled={!enableAutoBackup || isImporting} />}
                            label="Skip already imported"
                            sx={{ mt: 1 }}
                        />
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: 0.5 }}>
                            Imports all items or only new ones based on this option. Missing samples are not deleted in any case.
                        </Typography>
                    </Box>
                </Box>

                <Divider sx={{ my: 4 }} />

                {/* 6. NEW ECOTAXA SAMPLES */}
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, opacity: ecoTaxaActionsDisabled ? 0.65 : 1 }}>
                        <Box>
                            <Typography variant="h6">
                                New EcoTaxa samples
                                <InfoTooltip title={ecoTaxaImportInfoContent} />
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            color="inherit"
                            disabled={!ecoProjectLinked || ecoTaxaSamples.length === 0 || isImporting}
                            onClick={() => handleImportEcoTaxaSamples(true)}
                            sx={{ borderColor: 'divider', color: ecoProjectLinked ? 'text.secondary' : 'text.disabled' }}
                        >
                            IMPORT ALL IN ECOTAXA
                        </Button>
                    </Box>

                    {/* If there is no linked EcoTaxa project show an error message and disable import actions */}
                    {
                        !ecoProjectLinked ? (
                            <Box sx={{ border: `1px dashed ${ecotaxaColors.danger[500]}`, borderRadius: 1, p: 3, textAlign: 'center', color: 'error.main', mb: 2 }}>
                                <Typography variant="body2" color="error" fontWeight="bold">
                                    No EcoTaxa project linked
                                </Typography>
                            </Box>
                        ) : ecoTaxaSamples.length === 0 ? (
                            // MENTOR FIX: Updated empty state text to "0 samples found."
                            renderEmptyState(loadingEcoTaxa ? "Loading samples..." : "0 samples found.")
                        ) : (
                            <Box sx={{ width: '100%', mb: 1 }}>
                                {renderSelectionBar(ecoTaxaSelectionCount, () => handleImportEcoTaxaSamples(false), !ecoProjectLinked || ecoTaxaSelectionCount === 0 || isImporting, true)}
                                <DataGrid
                                    rows={ecoTaxaSamples}
                                    columns={ecoTaxaSamplesColumns}
                                    getRowId={(row) => row.sample_id}
                                    checkboxSelection
                                    disableRowSelectionExcludeModel
                                    disableRowSelectionOnClick
                                    loading={loadingEcoTaxa}
                                    rowSelectionModel={selectedEcoTaxaSamples}
                                    onRowSelectionModelChange={(newSelection) => setSelectedEcoTaxaSamples(newSelection)}
                                    initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                                    pageSizeOptions={[5, 10, 25, 50, 100, { value: Math.max(ecoTaxaSamples.length, 1), label: "All" }]}
                                    autoHeight
                                    sx={dataGridStyles}
                                />
                            </Box>
                        )
                    }
                </Box>
            </SectionCard>

            {/* --- QC MODAL --- */}
            <ThemeProvider theme={qcModalTheme}>
                <Dialog open={isQcModalOpen} onClose={() => setIsQcModalOpen(false)} maxWidth="lg" fullWidth scroll="paper">
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* component="span": DialogTitle renders an <h2>, so a nested heading (variant="h5"
                            defaults to <h5>) would be invalid HTML. */}
                        <Typography component="span" variant="h5" fontWeight="bold">Visual quality control and import</Typography>
                    </DialogTitle>
                    <DialogContent
                        dividers
                        ref={qcScrollRef}
                        onScroll={updateQcScrollState}
                        sx={{ backgroundColor: 'grey.50' }}
                    >
                        {/* Wrapper measured by the ResizeObserver above: its height is what grows as the
                            charts mount, and what decides whether the dialog is scrollable at all. */}
                        <Box ref={qcContentRef}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Please review the graphs of every sample below, then import them as validated. If the image
                                selection or the descending filter does not look right, cancel this import, go back to
                                Zooprocess or UVPapp to run the procedure again, and import the samples afterwards.
                            </Typography>

                            <Typography variant="body1" sx={{ mb: 4 }}>
                                You are about to import <strong>{qcSampleNames.length}</strong> {qcSampleNames.length === 1 ? "sample" : "samples"} : <strong>{qcSampleNames.join(", ")}</strong>
                            </Typography>

                            {qcPreviewError && (
                                <Alert severity="warning" sx={{ mb: 3 }}>
                                    <AlertTitle>QC graphs unavailable</AlertTitle>
                                    {qcPreviewError}
                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                        {qcSampleNames.length === 1 ? "This sample" : "These samples"} can still be
                                        imported, but without the visual quality control — import{' '}
                                        {qcSampleNames.length === 1 ? "it" : "them"} as pending if you want to review{' '}
                                        {qcSampleNames.length === 1 ? "it" : "them"} later.
                                    </Typography>
                                </Alert>
                            )}

                            {loadingQcPreview ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
                                    <CircularProgress />
                                    <Typography variant="body2" color="text.secondary">Computing QC graphs…</Typography>
                                </Box>
                            ) : (
                                <>
                                    {/* Samples the preview endpoint rejected as not importable: no QC graphs, but
                                        shown FIRST (they block the import) with a red border and a REMOVE button so
                                        the operator can spot and drop them without scrolling past the chart cards. */}
                                    {qcNotImportable.map((name) => (
                                        <Box key={name} sx={{ backgroundColor: ecotaxaColors.danger[50], p: 3, borderRadius: 1, border: '2px solid', borderColor: 'error.main', mb: 3 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                                <Typography variant="subtitle2" fontWeight="bold" color="error.main">Sample : {name}</Typography>
                                                <Button
                                                    onClick={() => removeQcSample(name)}
                                                    disabled={isImporting}
                                                    color="error"
                                                    sx={{ fontWeight: 'bold' }}
                                                    size="small"
                                                >
                                                    REMOVE FROM IMPORT
                                                </Button>
                                            </Box>
                                            <Alert severity="error">
                                                This sample is not importable, so no QC preview could be generated. Remove it from the import to continue.
                                            </Alert>
                                        </Box>
                                    ))}

                                    {qcPreviews.map((sample) => (
                                        <QcSampleCard
                                            key={sample.sample_name}
                                            sample={sample}
                                            onRemove={removeQcSample}
                                            removeDisabled={isImporting}
                                        />
                                    ))}
                                </>
                            )}
                        </Box>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        {qcNotImportable.length > 0 ? (
                            <Typography variant="caption" color="error" sx={{ mr: 'auto' }}>
                                Remove the non-importable sample{qcNotImportable.length > 1 ? 's' : ''} to continue.
                            </Typography>
                        ) : !qcFullyReviewed && !loadingQcPreview && (
                            // Explains the disabled import buttons: without it the operator has no way to
                            // know the review gate exists.
                            <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
                                Scroll down through every graph to enable the import.
                            </Typography>
                        )}
                        <Button
                            onClick={() => confirmAndExecuteRawImport(true)}
                            disabled={importActionsDisabled}
                            variant="text"
                            color="success"
                            sx={{ fontWeight: 'bold' }}
                        >
                            IMPORT &amp; VALIDATE
                        </Button>
                        <Button
                            onClick={() => confirmAndExecuteRawImport(false)}
                            disabled={importActionsDisabled}
                            variant="text"
                            color="info"
                            sx={{ fontWeight: 'bold' }}
                        >
                            IMPORT &amp; PENDING
                        </Button>
                        <Button onClick={() => setIsQcModalOpen(false)} color="error" sx={{ fontWeight: 'bold' }}>
                            CANCEL IMPORT
                        </Button>
                    </DialogActions>
                </Dialog>
            </ThemeProvider>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={closeSnackbar} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: "100%" }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
};