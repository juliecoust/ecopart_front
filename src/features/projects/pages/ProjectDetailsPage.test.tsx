import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import ProjectDetailsPage from './ProjectDetailsPage';
import { renderWithRouter } from '@/test/utils';
import { server } from '@/test/msw/server';
import { loginAsUser } from '@/test/helpers/auth.helpers';

// Helper to mock the project fetch API call which the child tabs rely on
const mockProjectFetch = (projectId: number) => {
    server.use(
        // Note: getProjectById uses POST /projects/searches under the hood
        http.post('*/projects/searches', () => {
            return HttpResponse.json({
                search_info: { total: 1, page: 1, limit: 1 },
                projects: [{
                    project_id: projectId,
                    project_title: 'Test Project',
                    project_acronym: 'TEST',
                    instrument_model: 'UVP5HD',
                    root_folder_path: '/data/test',
                    // Needed for security tab
                    privacy_duration: 2,
                    visible_duration: 24,
                    public_duration: 36,
                    managers: [],
                    members: [],
                    contact: null
                }]
            });
        }),
        // Also mock standard endpoints to prevent noisy console errors during mount
        http.get('*/users', () => HttpResponse.json({ users: [] })),
        http.get('*/ecotaxa_instances', () => HttpResponse.json([])),
        http.get('*/users/*/ecotaxa_account', () => HttpResponse.json({ ecotaxa_accounts: [] })),
        http.get('*/projects/*/backup/last-date', () => HttpResponse.json({ last_backup_date: null })),
        // Import tab hooks can be mounted and request these endpoints even when testing other tabs.
        http.get('*/projects/*/samples/can_be_imported', () => HttpResponse.json([])),
        http.get('*/projects/*/ecotaxa_samples/can_be_imported', () => HttpResponse.json([])),
        http.get('*/projects/*/ctd_samples/can_be_imported', () => HttpResponse.json([]))
    );
};

describe('ProjectDetailsPage (Functional)', () => {

    beforeEach(() => {
        loginAsUser();
        vi.clearAllMocks();
    });

    // TC-I1: Invalid ID Handling
    it('TC-I1: should display an error if the URL ID is invalid', () => {
        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/invalid-string' }
        );

        expect(screen.getByText(/Invalid Project ID/i)).toBeInTheDocument();
        expect(screen.queryByText(/Project Details/i)).not.toBeInTheDocument();
    });

    // TC-I2: Initial Render (Default Tab)
    it('TC-I2: should render the header and default to the Metadata tab', async () => {
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101' }
        );

        // Verify Header
        expect(await screen.findByRole('heading', { name: 'Test Project' })).toBeInTheDocument();

        // Verify Default Tab is Metadata
        const metadataTab = screen.getByRole('tab', { name: /METADATA/i });
        expect(metadataTab).toHaveAttribute('aria-selected', 'true');

        // Verify Metadata content is visible
        expect(await screen.findByLabelText(/Project acronym/i)).toBeInTheDocument();
    }, 15000);

    // TC-I3: Tab Switching
    it('TC-I3: should switch content when different tabs are clicked', async () => {
        const user = userEvent.setup({ delay: null });
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101' }
        );

        // Wait for initial load
        await screen.findByRole('heading', { name: 'Test Project' });

        // Click SECURITY tab
        const securityTab = screen.getByRole('tab', { name: /SECURITY/i });
        await user.click(securityTab);

        // Verify SECURITY tab is active
        expect(securityTab).toHaveAttribute('aria-selected', 'true');

        // Verify Security content appears (e.g. Data privacy delays)
        expect(await screen.findByText(/Data privacy delays/i)).toBeInTheDocument();

        // Verify STATS tab (empty-state guidance)
        const statsTab = screen.getByRole('tab', { name: /STATS/i });
        await user.click(statsTab);

        expect(await screen.findByText(/Import data to get started\./i)).toBeInTheDocument();
        expect(screen.getByText(/is not linked to an EcoTaxa project/i)).toBeInTheDocument();
    }, 20000);

    // TC-I3c: Stats tab call-to-actions
    it('TC-I3c: should route to the Import tab and the EcoTaxa link anchor from the Stats actions', async () => {
        const user = userEvent.setup({ delay: null });
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101/stats' }
        );

        await screen.findByRole('heading', { name: 'Test Project' });

        await user.click(await screen.findByRole('button', { name: /IMPORT DATA/i }));
        expect(screen.getByRole('tab', { name: /IMPORT/i })).toHaveAttribute('aria-selected', 'true');

        // Back to STATS, then follow the EcoTaxa call-to-action
        await user.click(screen.getByRole('tab', { name: /STATS/i }));
        await user.click(await screen.findByRole('button', { name: /LINK PROJECT/i }));

        expect(screen.getByRole('tab', { name: /METADATA/i })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByLabelText(/Project acronym/i)).toBeInTheDocument();
    }, 20000);

    // TC-I3b: Deep-linked tab URL
    it('TC-I3b: should open the Backup tab when the URL includes the tab name', async () => {
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101/backup' }
        );

        expect(await screen.findByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /BACKUP/i })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('heading', { name: /Backup of the raw project/i })).toBeInTheDocument();
    }, 20000);

    // TC-I6: Initial Render From Navigation State
    it('TC-I6: should open the Import tab when activeTab is provided in navigation state', async () => {
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101', state: { activeTab: 3 } }
        );

        expect(await screen.findByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /IMPORT/i })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('heading', { name: /New UVP samples/i })).toBeInTheDocument();
    });

    // TC-I4: Explore Navigation
    it('TC-I4: should navigate to explore page with the correct project ID', async () => {
        const user = userEvent.setup();
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
                <Route path="/explore" element={<h1>Explore Page Mock</h1>} />
            </Routes>,
            { route: '/projects/101' }
        );

        await screen.findByRole('heading', { name: 'Test Project' });

        const exploreButton = screen.getByRole('button', { name: /EXPLORE/i });
        await user.click(exploreButton);

        // Verify navigation occurred
        expect(await screen.findByText('Explore Page Mock')).toBeInTheDocument();

        // Note: In a real test we might spy on the useNavigate hook, 
        // but checking the rendered route mock is the React Testing Library way.
    });

    // TC-I7: Delete hidden for a non-manager
    it('TC-I7: should not offer DELETE when the user does not manage the project', async () => {
        mockProjectFetch(101);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101' }
        );

        await screen.findByRole('heading', { name: 'Test Project' });

        expect(screen.queryByRole('button', { name: /^DELETE$/i })).not.toBeInTheDocument();
    }, 15000);

    // TC-I8: Delete then navigate back to the project list
    it('TC-I8: should delete the project and return to the project list', async () => {
        const user = userEvent.setup();
        const deletedIds: string[] = [];

        mockProjectFetch(101);
        server.use(
            // Managed by the logged-in user (user_id 1), so DELETE is offered.
            http.post('*/projects/searches', () => HttpResponse.json({
                search_info: { total: 1, page: 1, limit: 1 },
                projects: [{
                    project_id: 101,
                    project_title: 'Test Project',
                    project_acronym: 'TEST',
                    instrument_model: 'UVP5HD',
                    root_folder_path: '/data/test',
                    privacy_duration: 2,
                    visible_duration: 24,
                    public_duration: 36,
                    managers: [{ user_id: 1 }],
                    members: [],
                    contact: null
                }]
            })),
            http.delete('*/projects/:projectId/', ({ params }) => {
                deletedIds.push(String(params.projectId));
                return HttpResponse.json({ message: 'deleted' });
            })
        );
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
                <Route path="/projects" element={<h1>Projects List Mock</h1>} />
            </Routes>,
            { route: '/projects/101' }
        );

        await screen.findByRole('heading', { name: 'Test Project' });

        await user.click(await screen.findByRole('button', { name: /^DELETE$/i }));

        expect(confirmSpy).toHaveBeenCalled();
        expect(await screen.findByText('Projects List Mock')).toBeInTheDocument();
        expect(deletedIds).toEqual(['101']);

        confirmSpy.mockRestore();
    }, 15000);

    // TC-I5: API Error Handling
    it('TC-I5: should show an error state when project details loading fails', async () => {
        server.use(
            http.post('*/users/searches*', () => {
                return HttpResponse.json({
                    search_info: { total: 0, page: 1, limit: 100 },
                    users: []
                });
            }),
            http.post('*/projects/searches', () => {
                return HttpResponse.json({ message: 'Project details unavailable' }, { status: 500 });
            })
        );

        renderWithRouter(
            <Routes>
                <Route path="/projects/:id/:tabName?" element={<ProjectDetailsPage />} />
            </Routes>,
            { route: '/projects/101' }
        );

        // Page chrome should still render and app should not crash
        expect(await screen.findByText('Project Details')).toBeInTheDocument();

        // Metadata tab should surface the load error
        expect(await screen.findByText(/Failed to load project details\./i)).toBeInTheDocument();
    });

});