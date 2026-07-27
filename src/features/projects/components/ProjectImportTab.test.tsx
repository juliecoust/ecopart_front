import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocks API
vi.mock('../api/projects.api', () => ({
    getProjectById: vi.fn(),
    getImportableRawSamples: vi.fn(),
    getImportableEcoTaxaSamples: vi.fn(),
    getImportableCtdSamples: vi.fn(),
    importRawSamples: vi.fn(),
    importEcoTaxaSamples: vi.fn(),
    importProjectCtdSamples: vi.fn(),
    previewSamplesQcGraphs: vi.fn(),
}));

import {
    getProjectById,
    getImportableRawSamples,
    getImportableEcoTaxaSamples,
    getImportableCtdSamples,
    importRawSamples,
    previewSamplesQcGraphs,
    SampleQcGraphs,
} from '../api/projects.api';

import { useProjectImportTab } from '../hooks/useProjectImportTab';
import { ProjectImportTab } from './ProjectImportTab';

const mockedGetProjectById = vi.mocked(getProjectById);
const mockedGetImportableRawSamples = vi.mocked(getImportableRawSamples);
const mockedGetImportableEcoTaxaSamples = vi.mocked(getImportableEcoTaxaSamples);
const mockedGetImportableCtdSamples = vi.mocked(getImportableCtdSamples);
const mockedImportRawSamples = vi.mocked(importRawSamples);
const mockedPreviewSamplesQcGraphs = vi.mocked(previewSamplesQcGraphs);

// Minimal QC-graphs payload for a not-yet-imported sample (shape from ecopart_back).
const mockQcGraphs = (name: string): SampleQcGraphs => ({
    sample_id: null,
    sample_name: name,
    instrument_model: 'UVP5HD',
    depth_unit: 'm',
    visual_qc_status_label: 'NOT_IMPORTED',
    image_depth_profile: {
        points: [
            { image_index: 0, image_id: '10', depth_m: 5, is_selected: true },
            { image_index: 1, image_id: '11', depth_m: 10, is_selected: true },
        ],
        filter_first_image: '10',
        filter_last_image: '11',
        total_images: 2,
        selected_images: 2,
    },
    imaged_volume_profile: {
        bin_size_m: 1,
        suggested_scale: 'linear',
        series: [{ label: 'imaged volume', unit: 'L', points: [{ depth_m: 5, value: 1 }, { depth_m: 10, value: 2 }] }],
    },
    particle_lpm_profile: {
        bin_size_m: 1,
        suggested_scale: 'log',
        series: [
            { label: '1 px', unit: 'count', points: [{ depth_m: 5, value: 3 }] },
            { label: '2 px', unit: 'count', points: [{ depth_m: 5, value: 1 }] },
            { label: '3 px', unit: 'count', points: [{ depth_m: 5, value: 0 }] },
        ],
    },
    black_profile: null,
    image_filtering: {
        first_image: '10',
        last_image: '99999',
        last_image_used: '11',
        removed_images: { count: 0, percent: 0 },
    },
});

describe('I. IMPORT TAB (ProjectImportTab)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockedGetProjectById.mockResolvedValue({
            project_id: 77,
            project_title: 'Project',
            project_acronym: 'PRJ',
            instrument_model: 'UVP5HD',
            ecotaxa_project_name: null,
            root_folder_path: '/data/project_77',
        });

        mockedGetImportableRawSamples.mockResolvedValue([
            { sample_name: 'raw-1', qc_lvl1: true },
            { sample_name: 'raw-2', qc_lvl1: false },
            { sample_name: 'raw-3', qc_lvl1: true },
        ]);

        mockedGetImportableEcoTaxaSamples.mockResolvedValue([]);
        mockedGetImportableCtdSamples.mockResolvedValue([]);
        mockedImportRawSamples.mockResolvedValue({ success: true, task_import_samples: 42 });
        mockedPreviewSamplesQcGraphs.mockImplementation(async (_projectId, names) => names.map(mockQcGraphs));
    });

    describe('Functional Tests', () => {
        it('TC-N1 - Raw import (pending) success + cleanup (Hook level)', async () => {
            const { result } = renderHook(() => useProjectImportTab(77));

            await waitFor(() => {
                expect(result.current.loadingRaw).toBe(false);
            });

            // Select the first sample by its sample_name (row id is sample_name)
            act(() => {
                result.current.setSelectedRawSamples({ type: 'include', ids: new Set(['raw-1']) });
            });

            await waitFor(() => {
                expect(result.current.rawSelectionCount).toBeGreaterThan(0);
            });

            // Opening the QC modal fetches the preview for the selected sample.
            await act(async () => {
                await result.current.handlePreImportRawSamples(false);
            });

            expect(result.current.isQcModalOpen).toBe(true);
            expect(mockedPreviewSamplesQcGraphs).toHaveBeenCalledWith(77, ['raw-1']);
            expect(result.current.qcPreviews).toHaveLength(1);

            // IMPORT & PENDING → validated_samples is empty.
            await act(async () => {
                await result.current.confirmAndExecuteRawImport(false);
            });

            expect(mockedImportRawSamples).toHaveBeenCalledWith(
                77,
                expect.objectContaining({
                    samples: ['raw-1'],
                    validated_samples: [],
                    backup_project: true,
                    backup_project_skip_already_imported: true,
                })
            );

            // Selection should be reset and import flag cleared after execution
            expect(result.current.selectedRawSamples.ids.size).toBe(0);
            expect(result.current.isImporting).toBe(false);
        });

        it('TC-N1b - IMPORT & VALIDATE sends every reviewed sample as validated (Hook level)', async () => {
            const { result } = renderHook(() => useProjectImportTab(77));

            await waitFor(() => expect(result.current.loadingRaw).toBe(false));

            act(() => {
                result.current.setSelectedRawSamples({ type: 'include', ids: new Set(['raw-1', 'raw-3']) });
            });

            await act(async () => {
                await result.current.handlePreImportRawSamples(false);
            });

            await act(async () => {
                await result.current.confirmAndExecuteRawImport(true);
            });

            expect(mockedImportRawSamples).toHaveBeenCalledWith(
                77,
                expect.objectContaining({
                    samples: ['raw-1', 'raw-3'],
                    validated_samples: ['raw-1', 'raw-3'],
                })
            );
        });

        it('TC-N1c - REMOVE FROM IMPORT drops a sample from the working set (Hook level)', async () => {
            const { result } = renderHook(() => useProjectImportTab(77));

            await waitFor(() => expect(result.current.loadingRaw).toBe(false));

            act(() => {
                result.current.setSelectedRawSamples({ type: 'include', ids: new Set(['raw-1', 'raw-3']) });
            });

            await act(async () => {
                await result.current.handlePreImportRawSamples(false);
            });

            expect(result.current.qcSampleNames).toEqual(['raw-1', 'raw-3']);

            act(() => {
                result.current.removeQcSample('raw-1');
            });

            expect(result.current.qcSampleNames).toEqual(['raw-3']);
            expect(result.current.qcPreviews.map((p) => p.sample_name)).toEqual(['raw-3']);
            expect(result.current.isQcModalOpen).toBe(true);

            // Removing the last sample closes the modal (nothing left to import).
            act(() => {
                result.current.removeQcSample('raw-3');
            });

            expect(result.current.qcSampleNames).toEqual([]);
            expect(result.current.isQcModalOpen).toBe(false);
        });

        it('TC-N1d - partial importability: previews the good samples, keeps the bad one removable (Hook level)', async () => {
            // The batch endpoint rejects the whole request when any name is not importable; the good
            // names must be re-fetched.
            mockedPreviewSamplesQcGraphs.mockImplementation(async (_projectId, names) => {
                if (names.includes('raw-2')) throw new Error('Samples not importable: raw-2');
                return names.map(mockQcGraphs);
            });

            const { result } = renderHook(() => useProjectImportTab(77));
            await waitFor(() => expect(result.current.loadingRaw).toBe(false));

            act(() => {
                result.current.setSelectedRawSamples({ type: 'include', ids: new Set(['raw-1', 'raw-2']) });
            });

            await act(async () => {
                await result.current.handlePreImportRawSamples(false);
            });

            expect(result.current.qcNotImportable).toEqual(['raw-2']);
            expect(result.current.qcPreviews.map((p) => p.sample_name)).toEqual(['raw-1']);
            expect(result.current.qcPreviewError).toBeNull();
            expect(result.current.qcSampleNames).toEqual(['raw-1', 'raw-2']);

            // Removing the bad sample clears the blocker.
            act(() => {
                result.current.removeQcSample('raw-2');
            });
            expect(result.current.qcNotImportable).toEqual([]);
            expect(result.current.qcSampleNames).toEqual(['raw-1']);
        });

        it('TC-N2 - Select All UVP Samples (UI level)', async () => {
            const user = userEvent.setup();
            render(<ProjectImportTab projectId={77} />);

            // Wait for data grid to render
            const grid = await waitFor(
                () => screen.getByRole('grid'),
                { timeout: 10000 }
            );
            expect(grid).toBeInTheDocument();

            // Find and click select all checkbox (use accessible name to avoid brittle index-based selection)
            const selectAllCheckbox = await screen.findByRole('checkbox', { name: /select all/i });
            await user.click(selectAllCheckbox);

            // Verify all items are selected
            expect(await waitFor(
                () => screen.getByText(/2 items selected/i),
                { timeout: 5000 }
            )).toBeInTheDocument();

            // Verify import button becomes enabled
            const importBtn = screen.getByRole('button', { name: /IMPORT SELECTION/i });
            expect(importBtn).not.toBeDisabled();
        }, 15000);

        it('TC-N3a - QC modal renders one card per previewed sample with remove + footer actions', async () => {
            const user = userEvent.setup();
            render(<ProjectImportTab projectId={77} />);

            // Both the UVP and (empty) CTD sections render an "IMPORT ALL" button; the UVP one is the
            // only enabled one here.
            const importAllButtons = await screen.findAllByRole('button', { name: /^IMPORT ALL$/i });
            const rawImportAll = importAllButtons.find((b) => !b.hasAttribute('disabled')) ?? importAllButtons[0];
            await user.click(rawImportAll);

            // Subtitle lists the sample names being imported.
            expect(await screen.findByText(/You are about to import/i)).toBeInTheDocument();

            // One "REMOVE FROM IMPORT" button per previewed sample.
            const removeButtons = await screen.findAllByRole('button', { name: /REMOVE FROM IMPORT/i });
            expect(removeButtons).toHaveLength(3);

            // The three footer actions from the new mockup.
            expect(screen.getByRole('button', { name: /IMPORT & VALIDATE/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /IMPORT & PENDING/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /CANCEL IMPORT/i })).toBeInTheDocument();
        }, 20000);

        it('TC-N3b - partial importability shows a removable error card and blocks import (UI level)', async () => {
            mockedPreviewSamplesQcGraphs.mockImplementation(async (_projectId, names) => {
                if (names.includes('raw-2')) throw new Error('Samples not importable: raw-2');
                return names.map(mockQcGraphs);
            });

            const user = userEvent.setup();
            render(<ProjectImportTab projectId={77} />);

            const importAllButtons = await screen.findAllByRole('button', { name: /^IMPORT ALL$/i });
            const rawImportAll = importAllButtons.find((b) => !b.hasAttribute('disabled')) ?? importAllButtons[0];
            await user.click(rawImportAll);

            // The not-importable sample is shown with an error, and every sample keeps a remove button.
            expect(await screen.findByText(/not importable/i)).toBeInTheDocument();
            const removeButtons = await screen.findAllByRole('button', { name: /REMOVE FROM IMPORT/i });
            expect(removeButtons).toHaveLength(3); // raw-1 + raw-3 cards + raw-2 error card

            // Import is blocked until the bad sample is removed.
            expect(screen.getByRole('button', { name: /IMPORT & VALIDATE/i })).toBeDisabled();
            expect(screen.getByRole('button', { name: /IMPORT & PENDING/i })).toBeDisabled();
        }, 20000);

        it('TC-N3 - EcoTaxa Empty State Rendering', async () => {
            render(<ProjectImportTab projectId={77} />);

            // Wait for the warning message to appear
            expect(await waitFor(
                () => screen.getByText(/no ecotaxa project linked/i),
                { timeout: 10000 }
            )).toBeInTheDocument();

            // Verify the import button is disabled when no EcoTaxa project is linked
            const importAllEcoBtn = screen.getByRole('button', { name: /IMPORT ALL IN ECOTAXA/i });
            expect(importAllEcoBtn).toBeDisabled();
        }, 15000);
    });

    describe('Accessibility Tests', () => {
        it('TC-N4 - Keyboard Navigation (DataGrid)', async () => {
            const user = userEvent.setup();
            render(<ProjectImportTab projectId={77} />);

            // Wait for data to load
            const grid = await waitFor(
                () => screen.getByRole('grid'),
                { timeout: 10000 }
            );
            expect(grid).toBeInTheDocument();

            // Find first row checkbox (get all and use first)
            const checkboxes = await screen.findAllByLabelText(/Select row/i);
            const firstRowCheckbox = checkboxes[0];

            // Focus the checkbox directly and use Space to toggle the row selection
            firstRowCheckbox.focus();
            expect(firstRowCheckbox).toHaveFocus();

            // Press space to select and deselect
            await user.keyboard('[Space]');
            expect(firstRowCheckbox).toBeChecked();

            await user.keyboard('[Space]');
            expect(firstRowCheckbox).not.toBeChecked();
        });

        it('TC-N5 - Screen Reader Announcement for Empty States', async () => {
            render(<ProjectImportTab projectId={77} />);

            // Wait for the warning message in the EcoTaxa section
            const emptyStateText = await waitFor(
                () => screen.getByText(/no ecotaxa project linked/i),
                { timeout: 10000 }
            );
            expect(emptyStateText).toBeInTheDocument();

            // Only the UVP grid should remain visible when EcoTaxa is empty
            const grids = screen.queryAllByRole('grid');
            expect(grids).toHaveLength(1);
        }, 15000);
    });
});
