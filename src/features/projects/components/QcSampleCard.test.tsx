import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SampleQcGraphs, QcBinnedDepthProfile, QcAxisScale } from '../api/projects.api';
import { QcSampleCard } from './QcSampleCard';

const binned = (
    scale: QcAxisScale,
    series: { label: string; unit: string; values: number[] }[]
): QcBinnedDepthProfile => ({
    bin_size_m: 1,
    suggested_scale: scale,
    series: series.map((s) => ({
        label: s.label,
        unit: s.unit,
        points: s.values.map((value, i) => ({ depth_m: i * 5, value })),
    })),
});

const makeSample = (overrides: Partial<SampleQcGraphs> = {}): SampleQcGraphs => ({
    sample_id: null,
    sample_name: 'omer2_5',
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
    imaged_volume_profile: binned('linear', [{ label: 'imaged volume', unit: 'L', values: [1, 2] }]),
    // The all-zero "3 px" class exercises the log empty-series drop from inside the card too.
    particle_lpm_profile: binned('log', [
        { label: '1 px', unit: 'count', values: [3, 2] },
        { label: '2 px', unit: 'count', values: [1, 0] },
        { label: '3 px', unit: 'count', values: [0, 0] },
    ]),
    black_profile: null,
    image_filtering: {
        first_image: '10',
        last_image: '99999',
        last_image_used: '11',
        removed_images: { count: 3, percent: 12.6 },
    },
    ...overrides,
});

describe('components/QcSampleCard', () => {
    it('TC-AB6: renders the sample header and every graph title', () => {
        // Include a black profile so all four graph titles render.
        render(<QcSampleCard sample={makeSample({ black_profile: binned('linear', [{ label: '1 px', unit: 'count', values: [1, 2] }]) })} onRemove={() => {}} />);
        expect(screen.getByText('Sample : omer2_5')).toBeInTheDocument();
        expect(screen.getByText(/pressure of each image/i)).toBeInTheDocument();
        expect(screen.getByText(/Vertical profile of imaged volume/i)).toBeInTheDocument();
        expect(screen.getByText(/Vertical profile of black/i)).toBeInTheDocument();
        expect(screen.getByText(/particle \(LPM\)/i)).toBeInTheDocument();
    });

    it('TC-AB7: REMOVE FROM IMPORT calls onRemove with the sample name', async () => {
        const onRemove = vi.fn();
        const user = userEvent.setup();
        render(<QcSampleCard sample={makeSample()} onRemove={onRemove} />);

        await user.click(screen.getByRole('button', { name: /REMOVE FROM IMPORT/i }));

        expect(onRemove).toHaveBeenCalledTimes(1);
        expect(onRemove).toHaveBeenCalledWith('omer2_5');
    });

    it('TC-AB8: removeDisabled disables the remove button', () => {
        render(<QcSampleCard sample={makeSample()} onRemove={() => {}} removeDisabled />);
        expect(screen.getByRole('button', { name: /REMOVE FROM IMPORT/i })).toBeDisabled();
    });

    it('TC-AB9: displays the image-filtering metadata with a rounded removed percentage', () => {
        render(<QcSampleCard sample={makeSample()} onRemove={() => {}} />);
        expect(screen.getByDisplayValue('10')).toBeInTheDocument();      // First image
        expect(screen.getByDisplayValue('99999')).toBeInTheDocument();   // Last image
        expect(screen.getByDisplayValue('11')).toBeInTheDocument();      // Last used
        expect(screen.getByDisplayValue('3 / 13%')).toBeInTheDocument(); // 12.6% -> 13%
    });

    it('TC-AB10: omits the black graph entirely when black_profile is null', () => {
        render(<QcSampleCard sample={makeSample({ black_profile: null })} onRemove={() => {}} />);
        expect(screen.queryByText(/Vertical profile of black/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/No dark frames for this instrument/i)).not.toBeInTheDocument();
    });

    it('TC-AB11: renders the black profile chart (no placeholder) when black_profile is present', () => {
        const withBlack = makeSample({
            black_profile: binned('log', [
                { label: '1 px', unit: 'count', values: [5, 3] },
                { label: '2 px', unit: 'count', values: [2, 1] },
                { label: '3 px', unit: 'count', values: [1, 0] },
            ]),
        });
        render(<QcSampleCard sample={withBlack} onRemove={() => {}} />);

        expect(screen.queryByText(/No dark frames for this instrument/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Vertical profile of black/i)).toBeInTheDocument();
    });

    it('TC-AB15: plots the pressure profile as two series — kept images in blue, removed ones in red', () => {
        // The discarded images must still be drawn (in red), not filtered out of the graph: the
        // point of graph 1 is to SHOW what the first/last + descent filters removed.
        const mixed = makeSample({
            image_depth_profile: {
                points: [
                    { image_index: 0, image_id: '9', depth_m: 2, is_selected: false },
                    { image_index: 1, image_id: '10', depth_m: 5, is_selected: true },
                    { image_index: 2, image_id: '11', depth_m: 10, is_selected: true },
                    { image_index: 3, image_id: '12', depth_m: 8, is_selected: false },
                ],
                filter_first_image: '10',
                filter_last_image: '11',
                total_images: 4,
                selected_images: 2,
            },
        });
        const { container } = render(<QcSampleCard sample={mixed} onRemove={() => {}} />);

        // The pressure chart is the first one on the card; each series becomes one <g> of marks.
        const pressureChart = container.querySelectorAll('svg')[0];
        const fills = new Set(
            Array.from(pressureChart.querySelectorAll('circle, path[data-highlighted]'))
                .map((el) => (el.getAttribute('fill') ?? '').toLowerCase())
        );
        expect(fills.has('#3180b6')).toBe(true); // mainblue[500] — kept
        expect(fills.has('#d35643')).toBe(true); // danger[500]   — removed
    });

    /** md column width of each direct cell of the card's grid, tagged chart / metadata. */
    const cellWidths = (container: HTMLElement) => {
        const cells = Array.from(container.querySelector('.MuiGrid-container')!.children);
        return cells.map((cell) => ({
            kind: cell.querySelector('svg') ? 'chart' : 'metadata',
            md: Number(/MuiGrid-grid-md-(\d+)/.exec(cell.className)?.[1]),
        }));
    };

    it('TC-AB19: gives every graph the same column width, whatever the row holds', () => {
        // The four graphs must line up. They are cells of ONE grid, so equal `md` sizes means equal
        // rendered widths — and the metadata block takes exactly what is left of the 12 columns.
        // With the black profile the bottom row holds 3 graphs; without it, 2 wider ones — and the
        // pressure graph above has to follow, which is the case this locks down.
        for (const black of [binned('linear', [{ label: '1 px', unit: 'count', values: [1, 2] }]), null]) {
            const { container, unmount } = render(
                <QcSampleCard sample={makeSample({ black_profile: black })} onRemove={() => {}} />
            );
            const cells = cellWidths(container);
            const charts = cells.filter((c) => c.kind === 'chart');
            const metadata = cells.filter((c) => c.kind === 'metadata');

            expect(charts).toHaveLength(black ? 4 : 3);
            expect(new Set(charts.map((c) => c.md)).size).toBe(1);      // one width for all graphs
            expect(metadata).toHaveLength(1);
            expect(metadata[0].md).toBe(12 - charts[0].md);             // first row fills the width
            unmount();
        }
    });

    describe('Accessibility Tests', () => {
        it('TC-AB13: metadata fields are label-associated and read-only (not disabled)', () => {
            render(<QcSampleCard sample={makeSample()} onRemove={() => {}} />);

            for (const label of ['First image', 'Last image', 'Last used', 'Removed images']) {
                const input = screen.getByLabelText(new RegExp(label, 'i'));
                // Read-only (rather than disabled) keeps the value legible and the field reachable by
                // keyboard / screen reader, while its <label> stays programmatically associated.
                expect(input).not.toBeDisabled();
                expect(input).toHaveAttribute('readonly');
            }
        });

        it('TC-AB14: REMOVE FROM IMPORT is a keyboard-operable named button', async () => {
            const onRemove = vi.fn();
            const user = userEvent.setup();
            render(<QcSampleCard sample={makeSample()} onRemove={onRemove} />);

            const removeBtn = screen.getByRole('button', { name: /REMOVE FROM IMPORT/i });
            removeBtn.focus();
            expect(removeBtn).toHaveFocus();

            await user.keyboard('{Enter}');
            expect(onRemove).toHaveBeenCalledWith('omer2_5');
        });
    });
});
