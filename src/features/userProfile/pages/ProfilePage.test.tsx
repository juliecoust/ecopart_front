import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import ProfilePage from './ProfilePage';
import { renderWithRouter } from '@/test/utils';
import { server } from '@/test/msw/server';
import { loginAsUser, logoutUser } from '@/test/helpers/auth.helpers';

//import { EcoTaxaAccountLink } from '../api/profile.api';

// ============================================================================
// SUITE 1: ECOPART ACCOUNT TAB (TAB 0)
// ============================================================================
describe('ProfilePage - Ecopart Tab (Functional)', () => {

    beforeEach(() => {
        // Authenticate the user before each test in this suite
        loginAsUser();
    });

    // TC-E1: Initial Loading & Display
    it('TC-E1: should load and display user profile data correctly', async () => {
        renderWithRouter(<ProfilePage />);

        // Wait for structural element rather than specific text
        expect(await screen.findByRole('heading', { name: /Profile/i })).toBeInTheDocument();

        // Verify fields are loaded and accessible
        expect(screen.getByLabelText(/First name/i)).toHaveValue('John');
        expect(screen.getByLabelText(/Last name/i)).toHaveValue('Doe');
        expect(screen.getByLabelText(/Email/i)).toBeDisabled();
        expect(screen.getByLabelText(/Planned usage/i)).not.toBeDisabled();
    }, 15000);

    // TC-E2: Update Profile - Cancel Changes
    it('TC-E2: should revert changes when CANCEL is clicked', async () => {
        const user = userEvent.setup();
        renderWithRouter(<ProfilePage />);

        await screen.findByRole('heading', { name: /Profile/i });

        const firstNameInput = screen.getByLabelText(/First name/i);
        const cancelButton = screen.getByRole('button', { name: /CANCEL/i });

        await user.clear(firstNameInput);
        await user.type(firstNameInput, 'Jane');
        expect(firstNameInput).toHaveValue('Jane');

        await user.click(cancelButton);

        // Reverts to the original mocked value
        expect(firstNameInput).toHaveValue('John');
    }, 15000);

    // TC-E3: Update Profile - Validation & Disabled State
    it('TC-E3: should display validation errors and disable SAVE if required fields are empty', async () => {
        const user = userEvent.setup({ delay: null });
        renderWithRouter(<ProfilePage />);

        await screen.findByRole('heading', { name: /Profile/i });

        const saveButton = screen.getByRole('button', { name: /SAVE/i });
        const firstNameInput = screen.getByLabelText(/First name/i);
        const countryInput = screen.getByLabelText(/Country/i);

        // Clear First Name
        await user.clear(firstNameInput);
        expect(saveButton).toBeDisabled();

        // Restore First Name
        await user.type(firstNameInput, 'John');

        // Clear Country (Autocomplete usually requires clearing via backspace or clear button)
        await user.clear(countryInput);
        await user.tab(); // Trigger blur

        // Check specific country validation error message
        expect(await screen.findByText(/Please select a country/i)).toBeInTheDocument();
        expect(saveButton).toBeDisabled();
    }, 20000);

    // TC-E4: Update Profile - Success
    it('TC-E4: should save profile successfully', async () => {
        const user = userEvent.setup({ delay: null });
        renderWithRouter(<ProfilePage />);

        await screen.findByRole('heading', { name: /Profile/i });

        const firstNameInput = screen.getByLabelText(/First name/i);
        const saveButton = screen.getByRole('button', { name: /SAVE/i });

        await user.clear(firstNameInput);
        await user.type(firstNameInput, 'Jane');

        expect(saveButton).toBeEnabled();
        await user.click(saveButton);

        expect(await screen.findByText(/Profile updated successfully/i)).toBeInTheDocument();
    }, 20000);

    // TC-E5: Update Profile - API Error
    it('TC-E5: should display error message if update fails', async () => {
        const user = userEvent.setup({ delay: null });

        server.use(
            http.patch('*/users/:id', () => {
                // Use HttpResponse.error() to simulate a network failure.
                // This guarantees that fetch() rejects and the component's catch block is triggered.
                return HttpResponse.error();
            })
        );

        renderWithRouter(<ProfilePage />);
        await screen.findByRole('heading', { name: /Profile/i });

        const firstNameInput = screen.getByLabelText(/First name/i);
        await user.clear(firstNameInput);
        await user.type(firstNameInput, 'Jane');

        const saveButton = screen.getByRole('button', { name: /SAVE/i });
        await waitFor(() => {
            expect(saveButton).toBeEnabled();
        });

        await user.click(saveButton);

        expect(await screen.findByText(/Failed to update profile/i)).toBeInTheDocument();
    }, 15000);

    // TC-E6: Change Password - Validation & Disabled State
    it('TC-E6: should disable CHANGE button if passwords are invalid or do not match', async () => {
        const user = userEvent.setup({ delay: null });
        renderWithRouter(<ProfilePage />);

        await screen.findByRole('heading', { name: /Change password/i });

        const currentPasswordInput = screen.getByLabelText(/Current password/i);
        const newPasswordInput = screen.getByLabelText(/^New password/i);
        const confirmPasswordInput = screen.getByLabelText(/Re-type new password/i);
        const changeButton = screen.getByRole('button', { name: /CHANGE/i });

        // Weak password
        await user.type(currentPasswordInput, 'OldPass123!');
        await user.type(newPasswordInput, 'weak');
        await user.type(confirmPasswordInput, 'weak');

        expect(changeButton).toBeDisabled();
    }, 15000);

    // TC-E7: Change Password - Success
    it('TC-E7: should change password successfully', async () => {
        const user = userEvent.setup();
        renderWithRouter(<ProfilePage />);

        await screen.findByRole('heading', { name: /Change password/i });

        await user.type(screen.getByLabelText(/Current password/i), 'OldPass123!');
        await user.type(screen.getByLabelText(/^New password/i), 'NewPass123!');
        await user.type(screen.getByLabelText(/Re-type new password/i), 'NewPass123!');

        const changeButton = screen.getByRole('button', { name: /CHANGE/i });
        expect(changeButton).toBeEnabled();
        await user.click(changeButton);

        expect(await screen.findByText(/Password changed successfully/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Current password/i)).toHaveValue('');
    }, 15000);

    // TC-E8: Delete Account - API Error
    it('TC-E8: should handle deletion failure and keep the user on the page', async () => {
        const user = userEvent.setup();

        server.use(
            http.delete('*/users/:id', () => {
                // Simulate network failure to ensure catch block execution
                return HttpResponse.error();
            })
        );

        renderWithRouter(<ProfilePage />);
        await screen.findByRole('heading', { name: /Delete account/i });

        const deleteSectionButton = screen.getByRole('button', { name: /^DELETE$/i });
        await user.click(deleteSectionButton);

        // Isolate the dialog to prevent ambiguous queries
        const dialog = await screen.findByRole('dialog', { name: /Delete Account/i });
        const confirmDeleteButton = within(dialog).getByRole('button', { name: /Delete/i });

        await user.click(confirmDeleteButton);

        // Wait for the dialog to be completely removed from the DOM
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // Verify the error message is displayed
        expect(await screen.findByText(/Failed to delete account/i)).toBeInTheDocument();
    });

    // TC-E9: Delete Account - Success
    it('TC-E9: should delete account and redirect to login on success', async () => {
        const user = userEvent.setup();

        renderWithRouter(
            <Routes>
                <Route path="/settings" element={<ProfilePage />} />
                <Route path="/login" element={<h1>Login Page</h1>} />
            </Routes>,
            { route: '/settings' }
        );

        await screen.findByRole('heading', { name: /Delete account/i });

        const deleteSectionButton = screen.getByRole('button', { name: /^DELETE$/i });
        await user.click(deleteSectionButton);

        const dialog = await screen.findByRole('dialog', { name: /Delete Account/i });
        const confirmDeleteButton = within(dialog).getByRole('button', { name: /Delete/i });

        await user.click(confirmDeleteButton);

        // Successful redirection
        expect(await screen.findByText(/Login Page/i)).toBeInTheDocument();
    });

    // TC-E10: Admin Dashboard Navigation
    it('TC-E10: should navigate to admin dashboard when ADMIN button is clicked', async () => {
        logoutUser();

        server.use(
            http.get('*/auth/user/me', () => {
                return HttpResponse.json({
                    user_id: 1,
                    first_name: 'Admin',
                    last_name: 'User',
                    email: 'admin@test.com',
                    organisation: 'CNRS',
                    country: 'FR',
                    user_planned_usage: 'Administration',
                    is_admin: true,
                });
            })
        );

        loginAsUser();

        const user = userEvent.setup();

        renderWithRouter(
            <Routes>
                <Route path="/settings" element={<ProfilePage />} />
                <Route path="/admin" element={<h1>Admin Page</h1>} />
            </Routes>,
            { route: '/settings' }
        );

        const adminButton = await screen.findByRole('button', { name: /ADMIN DASHBOARD/i });
        await user.click(adminButton);

        // Verification of navigation
        expect(await screen.findByText(/Admin Page/i)).toBeInTheDocument();
    });

    // TC-E11: the delete-account section warns to transfer project access first.
    it('TC-E11: shows the note to transfer project access before deleting the account', async () => {
        renderWithRouter(<ProfilePage />);

        await screen.findByRole('heading', { name: /Delete account/i });

        expect(
            screen.getByText(/transfer access permissions for any projects you manage/i),
        ).toBeInTheDocument();
    });

});


// ============================================================================
// SUITE 2: ECOTAXA ACCOUNTS TAB (TAB 1)
// ============================================================================
describe('ProfilePage - EcoTaxa Tab (Functional)', () => {

    beforeEach(() => {
        // Authenticate the user before each test in this suite
        loginAsUser();
    });

    // TC-F1: Initial Loading & Display (List View)
    it('TC-F1: should display the list of accounts when the user has existing links', async () => {
        // 1. Arrange: Mock the API to return 1 existing account
        server.use(
            http.get('*/users/:id/ecotaxa_account', () => {
                return HttpResponse.json({
                    ecotaxa_accounts: [
                        {
                            ecotaxa_account_id: 123,
                            ecotaxa_account_instance_id: 1,
                            ecotaxa_user_login: 'mock_ecotaxa_user',
                            ecotaxa_account_instance_name: 'FR',
                            ecotaxa_expiration_date: '2026-12-31'
                        }
                    ]
                });
            })
        );

        // 2. Act: Render the component, forcing the router to open Tab 1 (EcoTaxa)
        renderWithRouter(
            <Routes>
                <Route path="/settings" element={<ProfilePage />} />
            </Routes>,
            { route: '/settings', state: { activeTab: 1 } }
        );

        // 3. Assert: Check if the list UI is rendered
        expect(await screen.findByText(/Accounts on EcoTaxa instances/i)).toBeInTheDocument();
        expect(await screen.findByText(/mock_ecotaxa_user/i)).toBeInTheDocument();
        expect(screen.getByText(/Instance: FR/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Connect to another account/i })).toBeInTheDocument();
    });

    // TC-F2: Initial Loading & Display (Form View)
    it('TC-F2: should display the form directly if the user has NO linked accounts', async () => {
        // Arrange: Mock the API to return an empty array
        server.use(
            http.get('*/users/:id/ecotaxa_account', () => {
                return HttpResponse.json({ ecotaxa_accounts: [] });
            })
        );

        // Act
        renderWithRouter(
            <Routes>
                <Route path="/settings" element={<ProfilePage />} />
            </Routes>,
            { route: '/settings', state: { activeTab: 1 } }
        );

        // Assert: Form header is present, Cancel button is absent
        // Use findByText for headings if findByRole is flaky with MUI Typography
        expect(await screen.findByText(/Log in to EcoTaxa/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Cancel and go back to list/i })).not.toBeInTheDocument();
    });

    // TC-F3: Form Validation & Disabled State
    it('TC-F3: should keep the LOG IN button disabled until the form is fully valid', async () => {
        const user = userEvent.setup();

        // Force empty list to show form
        server.use(http.get('*/users/:id/ecotaxa_account', () => HttpResponse.json({ ecotaxa_accounts: [] })));
        renderWithRouter(<ProfilePage />, { route: '/settings', state: { activeTab: 1 } });

        // Wait for the specific heading text
        // Wait for the specific heading text
        const formHeading = await screen.findByText('Log in to EcoTaxa');

        // We need to find the specific "LOG IN" button for EcoTaxa, not the "SAVE" button of the profile.
        // Since we are isolated in Tab 1, getByRole should be safe, but let's be specific.
        const loginButton = screen.getByRole('button', { name: 'LOG IN' });

        // Assert initially disabled
        expect(loginButton).toBeDisabled();

        // SCOPING - We need to find the inputs specifically inside the EcoTaxa form.
        // SCOPING - We need to find the inputs specifically inside the EcoTaxa form.
        // We find the parent container. The safest way is to go up a few levels from the heading.
        const formContainer = formHeading.closest('.MuiStack-root');
        if (!formContainer) throw new Error("Form container not found");

        await waitFor(() => {
            expect(within(formContainer as HTMLElement).getByRole('combobox', { name: /Instance/i })).toBeEnabled();
        });

        // Act: Fill inputs using `within` the specific container
        const emailInput = within(formContainer as HTMLElement).getByLabelText(/Email address/i);
        await user.type(emailInput, 'test@test.com');

        // Note: Password fields in MUI can be tricky. We use the same selector strategy as in fillAuthForm.
        const passwordInput = within(formContainer as HTMLElement).getByLabelText(/^Password/i, { selector: 'input' });
        await user.type(passwordInput, 'password123');

        expect(loginButton).toBeDisabled();

        // Act: Check consent
        const consentCheckbox = within(formContainer as HTMLElement).getByRole('checkbox');
        await user.click(consentCheckbox);

        // Assert enabled
        expect(loginButton).toBeEnabled();
    });

    // TC-F4: Link Account (Success)
    it('TC-F4: should successfully link an account and return to the list view', async () => {
        const user = userEvent.setup();

        // STRONG TYPING
        type MockAccountType = {
            ecotaxa_account_id: number;
            ecotaxa_account_instance_id: number;
            ecotaxa_user_login: string;
            ecotaxa_account_instance_name: string;
            ecotaxa_expiration_date: string;
        };
        let mockAccounts: MockAccountType[] = [];

        server.use(
            http.get('*/users/:id/ecotaxa_account', () => {
                return HttpResponse.json({ ecotaxa_accounts: mockAccounts });
            }),
            // Mock the POST request to succeed and update the mock state
            http.post('*/users/:id/ecotaxa_account', () => {
                mockAccounts = [{
                    ecotaxa_account_id: 999,
                    ecotaxa_account_instance_id: 1,
                    ecotaxa_user_login: 'new_linked_user',
                    ecotaxa_account_instance_name: 'FR',
                    ecotaxa_expiration_date: '2026-12-31'
                }];
                return HttpResponse.json({ message: 'Account linked' }, { status: 201 });
            })
        );

        renderWithRouter(<ProfilePage />, { route: '/settings', state: { activeTab: 1 } });

        // Wait for the form to appear
        const formHeading = await screen.findByText('Log in to EcoTaxa');
        const formContainer = formHeading.closest('.MuiStack-root');
        if (!formContainer) throw new Error("Form container not found");

        await waitFor(() => {
            expect(within(formContainer as HTMLElement).getByRole('combobox', { name: /Instance/i })).toBeEnabled();
        });

        // Fill the form using scoping
        const emailInput = within(formContainer as HTMLElement).getByLabelText(/Email address/i);
        await user.type(emailInput, 'test@test.com');

        const passwordInput = within(formContainer as HTMLElement).getByLabelText(/^Password/i, { selector: 'input' });
        await user.type(passwordInput, 'password123');

        const consentCheckbox = within(formContainer as HTMLElement).getByRole('checkbox');
        await user.click(consentCheckbox);

        // Submit
        const loginButton = within(formContainer as HTMLElement).getByRole('button', { name: 'LOG IN' });
        // Wait for the consent-driven re-render to enable the button before clicking;
        // under heavy parallel load the click can otherwise fire while it's still
        // disabled (pointer-events: none).
        await waitFor(() => expect(loginButton).toBeEnabled());
        await user.click(loginButton);

        // Assertions: We expect to see the new user in the list view
        expect(await screen.findByText(/new_linked_user/i)).toBeInTheDocument();
        // Form should be gone
        expect(screen.queryByText('Log in to EcoTaxa')).not.toBeInTheDocument();
    });

    // TC-F5: Unlink Account (API Error)
    it('TC-F5: should keep the account visible if unlink fails', async () => {
        const user = userEvent.setup();

        type MockAccountType = {
            ecotaxa_account_id: number;
            ecotaxa_account_instance_id: number;
            ecotaxa_user_login: string;
            ecotaxa_account_instance_name: string;
            ecotaxa_expiration_date: string;
        };

        const mockAccounts: MockAccountType[] = [{
            ecotaxa_account_id: 123,
            ecotaxa_account_instance_id: 1,
            ecotaxa_user_login: 'stays_linked_user',
            ecotaxa_account_instance_name: 'FR',
            ecotaxa_expiration_date: '2026-12-31'
        }];

        server.use(
            http.get('*/users/:id/ecotaxa_account', () => {
                return HttpResponse.json({ ecotaxa_accounts: mockAccounts });
            }),
            http.delete('*/users/:userId/ecotaxa_account/:connectionId', () => {
                return HttpResponse.error();
            })
        );

        renderWithRouter(<ProfilePage />, { route: '/settings', state: { activeTab: 1 } });

        expect(await screen.findByText(/stays_linked_user/i)).toBeInTheDocument();

        const unlinkButtons = screen.getAllByRole('button');
        const logoutButton = unlinkButtons.find(btn => btn.querySelector('svg[data-testid="LogoutIcon"]'));
        if (!logoutButton) throw new Error("Logout icon button not found");

        await user.click(logoutButton);

        const dialog = await screen.findByRole('dialog', { name: /Disconnect EcoTaxa Account/i });
        const confirmButton = within(dialog).getByRole('button', { name: /Disconnect/i });
        await user.click(confirmButton);

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // The account should remain because unlink failed.
        expect(screen.getByText(/stays_linked_user/i)).toBeInTheDocument();
    });

    // TC-F6: Unlink Account (Success)
    it('TC-F6: should remove the account from the list after successful unlinking', async () => {
        const user = userEvent.setup();

        // Strong typing for the mock state
        type MockAccountType = {
            ecotaxa_account_id: number;
            ecotaxa_account_instance_id: number;
            ecotaxa_user_login: string;
            ecotaxa_account_instance_name: string;
            ecotaxa_expiration_date: string;
        };

        let mockAccounts: MockAccountType[] = [{
            ecotaxa_account_id: 123,
            ecotaxa_account_instance_id: 1,
            ecotaxa_user_login: 'doomed_user',
            ecotaxa_account_instance_name: 'FR',
            ecotaxa_expiration_date: '2026-12-31'
        }];

        server.use(
            http.get('*/users/:id/ecotaxa_account', () => {
                return HttpResponse.json({ ecotaxa_accounts: mockAccounts });
            }),
            // Mock the DELETE request to succeed and clear the array
            http.delete('*/users/:userId/ecotaxa_account/:connectionId', () => {
                mockAccounts = []; // Update state so the next GET returns empty
                return HttpResponse.json({ message: 'Account unlinked' }, { status: 200 });
            })
        );

        renderWithRouter(<ProfilePage />, { route: '/settings', state: { activeTab: 1 } });

        // 1. Verify item is there
        expect(await screen.findByText(/doomed_user/i)).toBeInTheDocument();

        // 2. Click the logout/unlink icon button
        const unlinkButtons = screen.getAllByRole('button');
        const logoutButton = unlinkButtons.find(btn => btn.querySelector('svg[data-testid="LogoutIcon"]'));
        if (!logoutButton) throw new Error("Logout icon button not found");

        await user.click(logoutButton);

        // 3. Confirm in dialog
        const dialog = await screen.findByRole('dialog', { name: /Disconnect EcoTaxa Account/i });
        const confirmButton = within(dialog).getByRole('button', { name: /Disconnect/i });
        await user.click(confirmButton);

        // 4. Assertions: Dialog closes and item is gone
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // The core issue in TC-F6 was here. 
        // We need to use `waitFor` to give the component time to complete its internal 
        // fetch -> setState -> re-render cycle before asserting that the form text appears.
        await waitFor(async () => {
            // Using findByText as a more robust fallback than findByRole for MUI headings
            expect(await screen.findByText('Log in to EcoTaxa')).toBeInTheDocument();
        }, { timeout: 3000 }); // Optional: give it a slightly longer timeout just in case

        expect(screen.queryByText(/doomed_user/i)).not.toBeInTheDocument();
    });

    // TC-F7: EcoTaxa Form Cancel Behavior
    it('TC-F7: should cancel form, avoid link API call, and reset form state when reopened', async () => {
        const user = userEvent.setup();

        let linkCalls = 0;
        const mockAccounts = [{
            ecotaxa_account_id: 321,
            ecotaxa_account_instance_id: 1,
            ecotaxa_user_login: 'existing_user',
            ecotaxa_account_instance_name: 'FR',
            ecotaxa_expiration_date: '2026-12-31'
        }];

        server.use(
            http.get('*/users/:id/ecotaxa_account', () => {
                return HttpResponse.json({ ecotaxa_accounts: mockAccounts });
            }),
            http.get('*/ecotaxa_instances', () => {
                return HttpResponse.json([
                    {
                        ecotaxa_instance_id: 1,
                        ecotaxa_instance_name: 'FR',
                        ecotaxa_instance_description: 'France instance',
                        ecotaxa_instance_url: 'https://ecotaxa.obs-vlfr.fr/'
                    }
                ]);
            }),
            http.post('*/users/:id/ecotaxa_account', () => {
                linkCalls += 1;
                return HttpResponse.json({ message: 'linked' }, { status: 201 });
            })
        );

        renderWithRouter(<ProfilePage />, { route: '/settings', state: { activeTab: 1 } });

        expect(await screen.findByText(/existing_user/i)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Connect to another account/i }));
        expect(await screen.findByText(/Log in to EcoTaxa/i)).toBeInTheDocument();

        const emailInput = screen.getByLabelText(/Email address/i);
        const passwordInput = screen.getByLabelText(/^Password/i, { selector: 'input' });
        await user.type(emailInput, 'cancel@test.com');
        await user.type(passwordInput, 'Password123!');

        await user.click(screen.getByRole('button', { name: /Cancel and go back to list/i }));

        expect(await screen.findByText(/Accounts on EcoTaxa instances/i)).toBeInTheDocument();
        expect(screen.queryByText(/Log in to EcoTaxa/i)).not.toBeInTheDocument();
        expect(linkCalls).toBe(0);

        await user.click(screen.getByRole('button', { name: /Connect to another account/i }));
        expect(await screen.findByText(/Log in to EcoTaxa/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Email address/i)).toHaveValue('');
        expect(screen.getByLabelText(/^Password/i, { selector: 'input' })).toHaveValue('');
    });

});

// ============================================================================
// SUITE 3: SETTINGS BY USER ID (/settings/:userId/:tabName)
// ============================================================================
describe('ProfilePage - editing another account by id', () => {
    const mockMe = (isAdmin: boolean) =>
        server.use(
            http.get('*/auth/user/me', () =>
                HttpResponse.json({
                    user_id: 1, first_name: 'John', last_name: 'Doe', email: 'john@doe.com',
                    organisation: 'CNRS', country: 'FR', user_planned_usage: 'Admin', is_admin: isAdmin,
                }),
            ),
        );

    const renderAt = (route: string) =>
        renderWithRouter(
            <Routes>
                <Route path="/settings/:userId?/:tabName?" element={<ProfilePage />} />
            </Routes>,
            { route },
        );

    beforeEach(() => {
        loginAsUser();
    });

    it('TC-E20: an admin loads and edits another user via /settings/:id', async () => {
        mockMe(true);
        // getUserById → POST /users/searches returns the target account.
        server.use(
            http.post('*/users/searches*', () =>
                HttpResponse.json({
                    search_info: { total: 1, page: 1, limit: 1 },
                    users: [{
                        user_id: 2, first_name: 'Jane', last_name: 'Roe', email: 'jane@roe.com',
                        organisation: 'Sorbonne', country: 'FR', user_planned_usage: 'Research',
                        is_admin: false, valid_email: true, deleted: null,
                    }],
                }),
            ),
        );

        renderAt('/settings/2/ecopart_account');

        expect(await screen.findByRole('heading', { name: /Edit user #2/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/First name/i)).toHaveValue('Jane');
        // Password change is self-only, so the section is hidden for other accounts.
        expect(screen.queryByRole('heading', { name: /Change password/i })).not.toBeInTheDocument();
    });

    it('TC-E21: a non-admin is redirected to their own settings when targeting another id', async () => {
        mockMe(false);

        renderAt('/settings/2/ecopart_account');

        // Redirected to /settings/1/... → their own profile (self view).
        expect(await screen.findByRole('heading', { name: /^Profile$/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/First name/i)).toHaveValue('John');
    });
});