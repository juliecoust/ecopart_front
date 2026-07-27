import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import AdminUsersTab from './AdminUsersTab';
import { renderWithRouter } from '@/test/utils';
import { server } from '@/test/msw/server';
import { loginAsUser } from '@/test/helpers/auth.helpers';
import type { AdminUser } from '../api/adminUsers.api';

/** Surfaces the current location so navigation-driven actions can be asserted. */
function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search}</div>;
}

// ---------------------------------------------------------------------------
// Helpers — the admin USERS tab hits POST /users/searches (list) and
// PATCH /users/:id/ (grant / revoke admin).
// ---------------------------------------------------------------------------
type SearchCall = { page: string | null; limit: string | null; sort_by: string | null; filters: unknown };
type PatchCall = { userId: number; body: Record<string, unknown> };

let searchCalls: SearchCall[] = [];
let patchCalls: PatchCall[] = [];

const makeUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
    user_id: 1,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@doe.com',
    organisation: 'Sorbonne Université',
    country: 'FR',
    user_planned_usage: 'Research',
    is_admin: false,
    user_creation_utc_date_time: '2026-01-01T00:00:00.000Z',
    valid_email: true,
    deleted: null,
    ...overrides,
});

const mockUsersSearch = (users: AdminUser[], total = users.length) => {
    server.use(
        http.post('*/users/searches', async ({ request }) => {
            const url = new URL(request.url);
            const filters = await request.json();
            searchCalls.push({
                page: url.searchParams.get('page'),
                limit: url.searchParams.get('limit'),
                sort_by: url.searchParams.get('sort_by'),
                filters,
            });
            return HttpResponse.json({ search_info: { total, page: 1, limit: 10 }, users });
        }),
    );
};

const mockUserPatch = () => {
    server.use(
        http.patch('*/users/:userId/', async ({ params, request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            patchCalls.push({ userId: Number(params.userId), body });
            return HttpResponse.json(makeUser({ user_id: Number(params.userId) }));
        }),
    );
};

const renderUsersTab = () =>
    renderWithRouter(<><AdminUsersTab /><LocationProbe /></>, { route: '/admin/users' });

const mockUserDelete = () => {
    const deleteCalls: number[] = [];
    server.use(
        http.delete('*/users/:userId/', ({ params }) => {
            deleteCalls.push(Number(params.userId));
            return HttpResponse.json({ message: 'ok' });
        }),
    );
    return deleteCalls;
};

describe('AdminUsersTab', () => {
    beforeEach(() => {
        loginAsUser();
        vi.clearAllMocks();
        searchCalls = [];
        patchCalls = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('TC-AF1: renders the headers and the loaded users', async () => {
        mockUsersSearch([
            makeUser({ user_id: 1, first_name: 'John', last_name: 'Doe', email: 'john@doe.com' }),
            makeUser({ user_id: 2, first_name: 'Jane', last_name: 'Roe', email: 'jane@roe.com' }),
        ], 2);

        renderUsersTab();

        expect(screen.getByRole('heading', { name: 'User list' })).toBeInTheDocument();
        expect(screen.getByText('Additional description if required')).toBeInTheDocument();

        expect(await screen.findByText('John Doe')).toBeInTheDocument();
        expect(await screen.findByText('jane@roe.com')).toBeInTheDocument();
        // Default sort is desc(user_id).
        await waitFor(() => expect(searchCalls[searchCalls.length - 1]?.sort_by).toBe('desc(user_id)'));
    });

    it('TC-AF2: shows the no-rows overlay when there are no users', async () => {
        mockUsersSearch([], 0);

        renderUsersTab();

        expect(await screen.findByText(/No rows/i)).toBeInTheDocument();
    });

    it('TC-AF3: resolves the ISO country code to a display name', async () => {
        mockUsersSearch([makeUser({ user_id: 1, country: 'FR' })], 1);

        renderUsersTab();

        expect(await screen.findByText('France')).toBeInTheDocument();
    });

    it('TC-AF4: renders the Administrate flag as Yes / No', async () => {
        mockUsersSearch([
            makeUser({ user_id: 1, is_admin: true }),
            makeUser({ user_id: 2, is_admin: false }),
        ], 2);

        renderUsersTab();

        await screen.findByText('Yes');
        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('TC-AF5: maps account status to the correct icons', async () => {
        mockUsersSearch([
            makeUser({ user_id: 1, valid_email: true, deleted: null }),          // active
            makeUser({ user_id: 2, valid_email: false, deleted: null }),         // pending
            makeUser({ user_id: 3, valid_email: true, deleted: '2026-01-01' }),  // deactivated
        ], 3);

        renderUsersTab();

        expect(await screen.findByTestId('CheckCircleIcon')).toBeInTheDocument();
        expect(screen.getByTestId('MailOutlineIcon')).toBeInTheDocument();
        expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument();
    });

    it('TC-AF6: sends a LIKE filter on last_name after typing (Name is the default attribute)', async () => {
        const user = userEvent.setup();
        mockUsersSearch([makeUser({ user_id: 1 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        await user.type(screen.getByLabelText('Search'), 'doe');

        await waitFor(
            () => {
                expect(searchCalls[searchCalls.length - 1]?.filters).toEqual([
                    { field: 'last_name', operator: 'LIKE', value: '%doe%' },
                ]);
            },
            { timeout: 2000 },
        );
    });

    it('TC-AF7: sends an exact-match filter when searching by User id', async () => {
        const user = userEvent.setup();
        mockUsersSearch([makeUser({ user_id: 1 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        await user.click(screen.getByRole('combobox', { name: 'Attribute' }));
        await user.click(await screen.findByRole('option', { name: 'User id' }));

        await user.type(screen.getByLabelText('Search'), '42');

        await waitFor(
            () => {
                expect(searchCalls[searchCalls.length - 1]?.filters).toEqual([
                    { field: 'user_id', operator: '=', value: 42 },
                ]);
            },
            { timeout: 2000 },
        );
    });

    it('TC-AF8: requests the next (1-indexed) page on pagination change', async () => {
        const user = userEvent.setup();
        mockUsersSearch([makeUser({ user_id: 1 })], 45);

        renderUsersTab();

        await screen.findByText('John Doe');
        await waitFor(() => expect(searchCalls[searchCalls.length - 1]?.page).toBe('1'));

        await user.click(screen.getByRole('button', { name: /Go to next page/i }));

        await waitFor(() => {
            const last = searchCalls[searchCalls.length - 1];
            expect(last?.page).toBe('2');
            expect(last?.limit).toBe('10');
        });
    });

    it('TC-AF9: grants admin rights to the selection after confirmation', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockUsersSearch([
            makeUser({ user_id: 1, last_name: 'Doe', is_admin: false }),
            makeUser({ user_id: 2, first_name: 'Jane', last_name: 'Roe', is_admin: false }),
        ], 2);
        mockUserPatch();

        renderUsersTab();
        await screen.findByText('Jane Roe');

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[1]);
        await user.click(checkboxes[2]);

        expect(await screen.findByText('2 items selected')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'ADD ADMIN' }));

        await waitFor(() => expect(patchCalls.length).toBe(2));
        expect(patchCalls.every((c) => c.body.is_admin === true)).toBe(true);
        expect(patchCalls.map((c) => c.userId).sort()).toEqual([1, 2]);
        expect(await screen.findByText('Admin rights granted.')).toBeInTheDocument();
        expect(screen.getByText('0 items selected')).toBeInTheDocument();
    });

    it('TC-AF10: revokes admin rights to the selection after confirmation', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockUsersSearch([makeUser({ user_id: 5, is_admin: true })], 1);
        mockUserPatch();

        renderUsersTab();
        await screen.findByText('John Doe');

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[1]);

        expect(await screen.findByText('1 items selected')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'REMOVE ADMIN' }));

        await waitFor(() => expect(patchCalls.length).toBe(1));
        expect(patchCalls[0]).toEqual({ userId: 5, body: { is_admin: false } });
        expect(await screen.findByText('Admin rights revoked.')).toBeInTheDocument();
    });

    it('TC-AF11: does not call the API when the admin action is not confirmed', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        mockUsersSearch([makeUser({ user_id: 1 })], 1);
        mockUserPatch();

        renderUsersTab();
        await screen.findByText('John Doe');

        await user.click(screen.getAllByRole('checkbox')[1]);
        await user.click(screen.getByRole('button', { name: 'ADD ADMIN' }));

        // Give any (unexpected) request a chance to fire before asserting none did.
        await new Promise((r) => setTimeout(r, 100));
        expect(patchCalls).toHaveLength(0);
    });

    it('TC-AF12: disables the admin actions while nothing is selected', async () => {
        mockUsersSearch([makeUser({ user_id: 1 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        expect(screen.getByRole('button', { name: 'ADD ADMIN' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'REMOVE ADMIN' })).toBeDisabled();
    });

    it('TC-AF13: NEW USER is enabled; the removed mockup actions are gone and selection actions are disabled with no selection', async () => {
        mockUsersSearch([makeUser({ user_id: 1 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        // NEW USER now opens the create-user modal (no longer a "coming soon" stub).
        expect(screen.getByRole('button', { name: 'NEW USER' })).toBeEnabled();

        // Selection-scoped actions are disabled while nothing is selected.
        expect(screen.getByRole('button', { name: 'DELETE' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'TASKS' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'PROJECTS' })).toBeDisabled();

        // The filter icon and the old ACTIVE / DEACTIVATE / REMOVE FROM ALL PROJECTS
        // actions were removed per the admin-section feedback.
        expect(screen.queryByRole('button', { name: 'REMOVE FROM ALL PROJECTS' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'ACTIVE' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'DEACTIVATE' })).not.toBeInTheDocument();
    });

    it('TC-AF17: DELETE deactivates the selected accounts via DELETE /users/:id/ after confirmation', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockUsersSearch([
            makeUser({ user_id: 1, last_name: 'Doe' }),
            makeUser({ user_id: 2, first_name: 'Jane', last_name: 'Roe' }),
        ], 2);
        const deleteCalls = mockUserDelete();

        renderUsersTab();
        await screen.findByText('Jane Roe');

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[1]);
        await user.click(checkboxes[2]);

        expect(await screen.findByText('2 items selected')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'DELETE' }));

        await waitFor(() => expect(deleteCalls.sort()).toEqual([1, 2]));
        expect(await screen.findByText('User account(s) deleted.')).toBeInTheDocument();
    });

    it('TC-AF18: NEW USER opens the create-user modal', async () => {
        const user = userEvent.setup();
        mockUsersSearch([makeUser({ user_id: 1 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        await user.click(screen.getByRole('button', { name: 'NEW USER' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Create user' })).toBeInTheDocument();
    });

    it('TC-AF19: the row edit icon navigates to the user settings URL', async () => {
        const user = userEvent.setup();
        mockUsersSearch([makeUser({ user_id: 7 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        await user.click(screen.getByRole('button', { name: 'Edit user 7' }));

        expect(screen.getByTestId('location')).toHaveTextContent('/settings/7/ecopart_account');
    });

    it('TC-AF20: TASKS and PROJECTS open the matching admin tab filtered by the selected user', async () => {
        const user = userEvent.setup();
        mockUsersSearch([makeUser({ user_id: 3 })], 1);

        renderUsersTab();
        await screen.findByText('John Doe');

        await user.click(screen.getAllByRole('checkbox')[1]);
        await user.click(screen.getByRole('button', { name: 'PROJECTS' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/admin/projects?users=3');
    });

    it('TC-AF14: prevents selecting a deleted / anonymized account', async () => {
        mockUsersSearch([
            makeUser({ user_id: 1, last_name: 'Doe', deleted: null }),
            makeUser({ user_id: 38, first_name: 'anonym_38', last_name: 'anonym_38', deleted: '2026-02-17T00:00:00.000Z' }),
        ], 2);

        renderUsersTab();
        await screen.findByText('John Doe');

        // Header checkbox + one selectable row only (the deleted user's checkbox is disabled).
        const checkboxes = screen.getAllByRole('checkbox');
        const disabled = checkboxes.filter((c) => (c as HTMLInputElement).disabled);
        expect(disabled).toHaveLength(1);
    });

    it('TC-AF15: displays an error alert when the search fails', async () => {
        server.use(
            http.post('*/users/searches', () => new HttpResponse(null, { status: 500 })),
        );

        renderUsersTab();

        expect(await screen.findByText(/Failed to load users/i)).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });

    it('TC-AF21: derives and displays each user\'s manager / member project counts', async () => {
        mockUsersSearch([makeUser({ user_id: 9 })], 1);
        // The counts come from POST /projects/searches with a managers / members filter;
        // return a different total depending on which role was queried.
        server.use(
            http.post('*/projects/searches', async ({ request }) => {
                const filters = (await request.json()) as Array<{ field: string }>;
                const role = filters[0]?.field;
                const total = role === 'managers' ? 3 : role === 'members' ? 5 : 0;
                return HttpResponse.json({ search_info: { total, page: 1, limit: 1 }, projects: [] });
            }),
        );

        renderUsersTab();
        await screen.findByText('John Doe');

        // Manager count then member count for the single row.
        expect(await screen.findByText('3')).toBeInTheDocument();
        expect(await screen.findByText('5')).toBeInTheDocument();
    });

    it('TC-AF16: keeps only the failed users selected when some admin updates fail', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        mockUsersSearch([
            makeUser({ user_id: 1, last_name: 'Doe' }),
            makeUser({ user_id: 2, first_name: 'Jane', last_name: 'Roe' }),
        ], 2);
        // user 2 fails, user 1 succeeds.
        server.use(
            http.patch('*/users/:userId/', ({ params }) => {
                const userId = Number(params.userId);
                if (userId === 2) return new HttpResponse(null, { status: 500 });
                return HttpResponse.json(makeUser({ user_id: userId }));
            }),
        );

        renderUsersTab();
        await screen.findByText('Jane Roe');

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[1]);
        await user.click(checkboxes[2]);
        await user.click(screen.getByRole('button', { name: 'ADD ADMIN' }));

        expect(await screen.findByText('Failed to update some users.')).toBeInTheDocument();
        // The one failed user stays selected for a targeted retry.
        expect(await screen.findByText('1 items selected')).toBeInTheDocument();
    });
});
