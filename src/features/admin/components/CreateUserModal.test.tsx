import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import CreateUserModal from './CreateUserModal';
import { renderWithRouter } from '@/test/utils';
import { server } from '@/test/msw/server';
import { fillRegisterForm } from '@/test/helpers/registerForm.helpers';

// The modal reuses the public registration entry point (POST /users) and the
// organisations reference list.
const mockOrganisations = () =>
    server.use(
        http.get('*/organisations', () => HttpResponse.json(['CNRS', 'Sorbonne Université'])),
    );

// The modal shares the register form's fields, minus the terms checkbox.
const fillValidForm = (user: ReturnType<typeof userEvent.setup>) =>
    fillRegisterForm(user, {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        organisation: 'CNRS',
        country: 'France',
        usage: 'Research',
        acceptTerms: false,
    });

describe('CreateUserModal', () => {
    beforeEach(() => {
        mockOrganisations();
    });

    it('TC-CU1: keeps the submit button disabled until the form is valid', async () => {
        const user = userEvent.setup();
        renderWithRouter(<CreateUserModal open onClose={vi.fn()} onCreated={vi.fn()} />);

        expect(screen.getByTestId('create-user-submit')).toBeDisabled();

        await fillValidForm(user);

        await waitFor(() => expect(screen.getByTestId('create-user-submit')).toBeEnabled());
    });

    it('TC-CU2: creates the user via POST /users then calls onCreated and onClose', async () => {
        const user = userEvent.setup();
        let createBody: Record<string, unknown> | null = null;
        server.use(
            http.post('*/users', async ({ request }) => {
                createBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ user_id: 99 }, { status: 201 });
            }),
        );
        const onCreated = vi.fn();
        const onClose = vi.fn();

        renderWithRouter(<CreateUserModal open onClose={onClose} onCreated={onCreated} />);
        await fillValidForm(user);

        await waitFor(() => expect(screen.getByTestId('create-user-submit')).toBeEnabled());
        await user.click(screen.getByTestId('create-user-submit'));

        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(createBody).toMatchObject({
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
            organisation: 'CNRS',
            country: 'FR',
            user_planned_usage: 'Research',
        });
    });

    it('TC-CU3: surfaces a server error and keeps the dialog open', async () => {
        const user = userEvent.setup();
        server.use(
            http.post('*/users', () =>
                HttpResponse.json({ errors: [{ msg: 'Email already in use' }] }, { status: 400 }),
            ),
        );
        const onCreated = vi.fn();
        const onClose = vi.fn();

        renderWithRouter(<CreateUserModal open onClose={onClose} onCreated={onCreated} />);
        await fillValidForm(user);

        await waitFor(() => expect(screen.getByTestId('create-user-submit')).toBeEnabled());
        await user.click(screen.getByTestId('create-user-submit'));

        expect(await screen.findByText(/Email already in use/i)).toBeInTheDocument();
        expect(onCreated).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});
