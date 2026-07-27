import { http, HttpResponse } from 'msw';
import type { User } from '@/features/auth/types/user';

// Fake server
// We use a simple variable to simulate server-side session state.
// By default, the user is NOT logged in.
let isLoggedIn = false;

// We export a function to reset this state between tests (optional but clean)
export const resetMockAuth = () => { isLoggedIn = false; };

// Helper to force login state for tests that start "already logged in"
export const setMockAuth = (state: boolean) => { isLoggedIn = state; };

export const handlers = [
    // --- MOCK LOGIN ---
    http.post('*/auth/login', async ({ request }) => {
        const body = (await request.json()) as { email?: string; password?: string };

        // Check credentials
        if (body.email === 'john@doe.com' && body.password === 'Valid123!') {
            // Simulate creating a session on the server
            isLoggedIn = true;
            return HttpResponse.json({
                token: 'fake_jwt',
                refresh_token: 'fake_refresh',
                user: { email: 'john@doe.com' }
            });
        }

        return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }),

    // --- MOCK USER PROFILE (GET /me) ---
    // This handler is now "state-aware". It checks if the user logged in previously.
    http.get('*/auth/user/me', () => {
        if (!isLoggedIn) {
            // If login wasn't called successfully, return 401 Unauthorized
            return new HttpResponse(null, { status: 401 });
        }

        // If logged in, return the user profile
        return HttpResponse.json({
            user_id: 1,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@doe.com',
            organisation: 'Sorbonne Université',
            country: 'FR',
            is_admin: false,
            user_planned_usage: 'Scientific Research'
        });
    }),

    // --- MOCK REGISTER ---
    http.post('*/users', async () => {
        // Always return success for registration in basic tests 
        return HttpResponse.json({ message: "Success" }, { status: 201 });
    }),

    // --- MOCK ORGANISATIONS REFERENCE DATA ---
    http.get('*/users/organisations*', () => {
        return HttpResponse.json({
            organisations: [
                { organisation_id: 1, organisation_name: 'Sorbonne Universite' },
                { organisation_id: 2, organisation_name: 'CNRS' },
            ],
        });
    }),

    // --- MOCK ACTIVE USERS SEARCH ---
    // Used by privileges selectors in project forms and detail tabs.
    http.post('*/users/searches*', () => {
        return HttpResponse.json({
            search_info: { total: 1, page: 1, limit: 100 },
            users: [
                {
                    user_id: 1,
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@doe.com',
                },
            ],
        });
    }),

    // --- MOCK PROJECTS SEARCH (default) ---
    // The admin USERS tab derives per-user manager/member counts by searching
    // projects with a managers/members filter. A quiet default keeps unrelated
    // tests from hitting the network; tests that assert on it override via server.use.
    http.post('*/projects/searches*', () => {
        return HttpResponse.json({ search_info: { total: 0, page: 1, limit: 1 }, projects: [] });
    }),

    // --- MOCK RESET PASSWORD REQUEST ---
    http.post('*/auth/password/reset', async () => {
        // We simulate a slight delay for realism
        return HttpResponse.json({ message: "Reset email sent" }, { status: 200 });
    }),

    // --- MOCK RESET PASSWORD CONFIRM ---
    http.put('*/auth/password/reset', async () => {
        return HttpResponse.json({ message: "Password successfully reset" }, { status: 200 });
    }),

    // --- MOCK UPDATE PROFILE (PATCH /users/:id) ---
    http.patch('*/users/:id', async ({ request }) => {
        const body = (await request.json()) as Partial<User>;
        // Return the updated fields merged with default user data
        return HttpResponse.json({
            user_id: 1,
            first_name: body.first_name || 'John',
            last_name: body.last_name || 'Doe',
            email: 'john@doe.com',
            organisation: body.organisation || 'Sorbonne Université',
            country: body.country || 'FR',
            user_planned_usage: body.user_planned_usage || 'Scientific Research',
            is_admin: false,
        });
    }),

    // --- MOCK CHANGE PASSWORD ---
    http.post('*/auth/password/change', async () => {
        return HttpResponse.json({ message: "Password changed successfully" }, { status: 200 });
    }),

    // --- MOCK DELETE ACCOUNT ---
    http.delete('*/users/:id', async () => {
        return HttpResponse.json({ message: "Account deleted" }, { status: 200 });
    }),

    // --- MOCK REFRESH TOKEN ---
    // Prevent errors when the http interceptor tries to refresh on 401
    http.post('*/auth/refreshToken', async () => {
        return HttpResponse.json({
            token: 'new_fake_jwt',
            refresh_token: 'new_fake_refresh'
        }, { status: 200 });
    }),

    // --- MOCK ECOTAXA INSTANCES ---
    // Return available EcoTaxa instances that users can link to
    http.get('*/ecotaxa_instances', () => {
        return HttpResponse.json([
            {
                ecotaxa_instance_id: 1,
                ecotaxa_instance_name: 'FR',
                ecotaxa_instance_description: 'France instance',
                ecotaxa_instance_url: 'https://ecotaxa.obs-vlfr.fr'
            },
            {
                ecotaxa_instance_id: 2,
                ecotaxa_instance_name: 'USA',
                ecotaxa_instance_description: 'USA instance',
                ecotaxa_instance_url: 'https://ecotaxa.sst.nao.ac.uk'
            }
        ]);
    }),

    // --- MOCK INSTRUMENT MODELS ---
    // Used by NewProject and related forms to populate the instrument select.
    http.get('*/instrument_models*', () => {
        return HttpResponse.json({
            instrument_models: [
                {
                    instrument_model_id: 1,
                    instrument_model_name: 'UVP5HD',
                },
                {
                    instrument_model_id: 2,
                    instrument_model_name: 'IFCB',
                },
            ],
        });
    }),

    // --- MOCK SHIPS REFERENCE DATA ---
    // Used by NewProject ship autocomplete.
    http.get('*/projects/ships*', () => {
        return HttpResponse.json({
            ships: [
                { ship_id: 1, ship_name: 'tara' },
                { ship_id: 2, ship_name: 'thalassa' },
            ],
        });
    }),

    // --- MOCK IMPORT FOLDER METADATA ---
    // Supports tests that expect metadata extraction from folder naming conventions.
    http.get('*/file_system/import_folder_metadata*', ({ request }) => {
        const url = new URL(request.url);
        const folderPath = (url.searchParams.get('folder_path') || '').trim();
        const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || '';

        // Expected pattern: <instrument>_<serial>_<acronym>
        const parts = folderName.split('_');
        if (parts.length < 3) {
            return HttpResponse.json({ message: 'Invalid folder naming format' }, { status: 400 });
        }

        const rawInstrument = parts[0];
        const serial = parts[1];
        const acronym = parts.slice(2).join('_');

        if (!rawInstrument || !serial || !acronym) {
            return HttpResponse.json({ message: 'Invalid folder naming format' }, { status: 400 });
        }

        const normalizedInstrument = rawInstrument.toUpperCase() === 'UVP5' ? 'UVP5HD' : rawInstrument;

        return HttpResponse.json({
            project_acronym: acronym,
            project_description: '',
            cruise: '',
            ship: '',
            serial_number: serial,
            instrument_model: normalizedInstrument,
        });
    }),

    // --- MOCK GET LINKED ECOTAXA ACCOUNTS ---
    // Return the list of linked EcoTaxa accounts for a user
    http.get('*/users/:id/ecotaxa_account', () => {
        return HttpResponse.json({ ecotaxa_accounts: [] });
    }),

    // --- MOCK LINK ECOTAXA ACCOUNT ---
    // Success response when linking a new EcoTaxa account
    http.post('*/users/:id/ecotaxa_account', () => {
        return HttpResponse.json({ message: 'Account linked successfully' }, { status: 201 });
    }),

    // --- MOCK UNLINK ECOTAXA ACCOUNT ---
    // Success response when unlinking an EcoTaxa account
    http.delete('*/users/:userId/ecotaxa_account/:connectionId', () => {
        return HttpResponse.json({ message: 'Account unlinked successfully' }, { status: 200 });
    }),

    // --- MOCK ADMIN STATISTICS ---
    // Respects `include_storage`: every *_bytes field is null unless the query
    // explicitly asks for the (expensive) storage computation. This mirrors the
    // backend contract so the UI's "compute on click" flow is testable.
    http.get('*/admin/stats', ({ request }) => {
        const url = new URL(request.url);
        const includeStorage = url.searchParams.get('include_storage') === 'true';
        return HttpResponse.json(buildAdminStats(includeStorage));
    }),
];

/**
 * Builds a deterministic admin-stats payload for tests. When `includeStorage`
 * is false, all size fields are null (matching the backend when the disk scan
 * is not requested); when true they are populated with realistic byte counts.
 */
function buildAdminStats(includeStorage: boolean) {
    const bytes = (v: number) => (includeStorage ? v : null);
    return {
        generated_at: '2026-07-20T10:00:00.000Z',
        totals: {
            users: {
                total: 42,
                admins: 3,
                validated_email: 38,
                pending_validation: 4,
                deleted: 1,
                distinct_organisations: 7,
            },
            projects: {
                total: 40,
                backed_up: 30,
                linked_to_ecotaxa: 25,
                by_instrument: [
                    { label: 'UVP6LP', count: 22 },
                    { label: 'UVP5HD', count: 18 },
                ],
            },
            tasks: {
                total: 120,
                exports: 50,
                imports: 60,
                running: 2,
                failed: 5,
                by_type: [
                    { label: 'EXPORT', count: 40 },
                    { label: 'EXPORT_RAW', count: 10 },
                    { label: 'IMPORT_ECO_TAXA', count: 60 },
                ],
                by_status: [
                    { label: 'DONE', count: 110 },
                    { label: 'RUNNING', count: 2 },
                    { label: 'ERROR', count: 5 },
                ],
            },
            samples: {
                total: 300,
                imported_to_ecotaxa: 180,
                by_qc_status: [
                    { label: 'PENDING', count: 100 },
                    { label: 'VALIDATED', count: 170 },
                    { label: 'REJECTED', count: 30 },
                ],
            },
            storage: {
                total_size_bytes: bytes(123456789),
            },
            top_organisations: [
                { organisation: 'Sorbonne Universite', users: 20 },
                { organisation: 'CNRS', users: 12 },
            ],
        },
        period: {
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-07-20T00:00:00.000Z',
            granularity: 'month',
            new_users: 10,
            new_projects: 8,
            new_samples: 90,
            tasks: {
                total: 60,
                exports: 25,
                by_type: [{ label: 'EXPORT', count: 25 }],
                by_status: [{ label: 'DONE', count: 55 }],
            },
            baseline: {
                projects: 32,
                samples: 210,
                data_size_bytes: bytes(50000000),
            },
            series: [
                {
                    interval: '2026-01',
                    projects_created: 3,
                    samples_created: 30,
                    data_size_bytes: bytes(10000000),
                    cumulative_projects: 35,
                    cumulative_samples: 240,
                    cumulative_data_size_bytes: bytes(60000000),
                },
                {
                    interval: '2026-02',
                    projects_created: 5,
                    samples_created: 60,
                    data_size_bytes: bytes(20000000),
                    cumulative_projects: 40,
                    cumulative_samples: 300,
                    cumulative_data_size_bytes: bytes(80000000),
                },
            ],
        },
    };
}