import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import TopBar from './TopBar';
import { renderWithRouter } from '@/test/utils';
import { server } from '@/test/msw/server';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { loginAsUser, logoutUser } from '@/test/helpers/auth.helpers';

const renderTopBar = (route = '/') =>
    renderWithRouter(
        <Routes>
            <Route path="*" element={<TopBar />} />
        </Routes>,
        { route },
    );

// TopBar renders inline navigation, so for navigation assertions we mount it
// alongside marker routes via a wildcard layout.
const renderWithMarkers = (route = '/') =>
    renderWithRouter(
        <>
            <TopBar />
            <Routes>
                <Route path="/" element={<h1>Home Page</h1>} />
                <Route path="/settings/:userId?/:tabName?" element={<h1>Settings Page</h1>} />
                <Route path="/login" element={<h1>Login Page</h1>} />
                <Route path="/register" element={<h1>Register Page</h1>} />
            </Routes>
        </>,
        { route },
    );

describe('TopBar (Z)', () => {
    beforeEach(() => {
        logoutUser();
    });

    // TC-Z1: Authenticated nav + user menu
    it('TC-Z1: shows authed nav links and opens the user menu', async () => {
        const user = userEvent.setup();
        loginAsUser();
        renderTopBar();

        expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
        expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);

        // Open the avatar menu.
        await user.click(screen.getByText('John Doe'));

        expect(await screen.findByRole('menuitem', { name: /Settings/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /EcoTaxa account/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Log out/i })).toBeInTheDocument();
    });

    // TC-Z2: Menu navigation
    it('TC-Z2: navigates to /settings from the Settings menu item', async () => {
        const user = userEvent.setup();
        loginAsUser();
        renderWithMarkers();

        await user.click(screen.getByText('John Doe'));
        await user.click(await screen.findByRole('menuitem', { name: /^Settings$/i }));

        expect(await screen.findByRole('heading', { name: 'Settings Page' })).toBeInTheDocument();
    });

    // TC-Z3: Logout clears the store and returns home
    it('TC-Z3: logs out, clears the auth store and navigates home', async () => {
        const user = userEvent.setup();
        let logoutCalled = false;
        server.use(
            http.post('*/auth/logout', () => {
                logoutCalled = true;
                return HttpResponse.json({ message: 'bye' });
            }),
        );
        loginAsUser();
        renderWithMarkers();

        await user.click(screen.getByText('John Doe'));
        await user.click(await screen.findByRole('menuitem', { name: /Log out/i }));

        expect(await screen.findByRole('heading', { name: 'Home Page' })).toBeInTheDocument();
        expect(logoutCalled).toBe(true);
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    // TC-Z4: Logged-out state shows auth buttons
    it('TC-Z4: shows Log in / Register when unauthenticated and navigates', async () => {
        const user = userEvent.setup();
        renderWithMarkers();

        expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
        const loginBtn = screen.getByRole('button', { name: /Log in/i });
        expect(loginBtn).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Register/i })).toBeInTheDocument();

        await user.click(loginBtn);
        expect(await screen.findByRole('heading', { name: 'Login Page' })).toBeInTheDocument();
    });
});
