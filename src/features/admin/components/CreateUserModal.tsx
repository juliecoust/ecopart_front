import { useEffect, useMemo, useState } from "react";
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Autocomplete, CircularProgress, Alert, IconButton, Box,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import CloseIcon from "@mui/icons-material/Close";

import { CountriesWrapper, CountryOption } from "@/shared/country-wrapper";
import { PasswordInput } from "@/shared/components/PasswordInput";
import { getOrganisations } from "@/shared/api/referenceData.api";
import { registerUser } from "@/features/auth/api/register.api";
import {
    isValidEmail, isValidPassword, passwordsMatch, isNonEmpty,
} from "@/shared/utils/validation";
import { VALIDATION_MESSAGES } from "@/shared/utils/validation/messages";

interface CreateUserModalProps {
    open: boolean;
    onClose: () => void;
    /** Called after a user is created so the parent can refresh the list. */
    onCreated: () => void;
}

/**
 * CreateUserModal — the admin "NEW USER" dialog.
 *
 * Reuses the same account-creation entry point as the public sign-up form
 * (`registerUser` → POST /users): the backend creates the account and emails the
 * new user a link to validate their address. Mirrors the register form fields
 * (minus the terms checkbox, which is not relevant for an admin-created account).
 */
export default function CreateUserModal({ open, onClose, onCreated }: CreateUserModalProps) {
    const [organisationOptions, setOrganisationOptions] = useState<string[]>([]);
    const [loadingOrganisations, setLoadingOrganisations] = useState(true);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [organisation, setOrganisation] = useState("");
    const [countryCode, setCountryCode] = useState<string>("");
    const [usage, setUsage] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const countryOptions = useMemo<CountryOption[]>(() => CountriesWrapper.list(), []);

    // Reset the form each time the dialog is (re)opened.
    useEffect(() => {
        if (!open) return;
        setFirstName(""); setLastName(""); setEmail(""); setOrganisation("");
        setCountryCode(""); setUsage(""); setPassword(""); setConfirm("");
        setError(null); setSubmitting(false);
    }, [open]);

    useEffect(() => {
        let cancelled = false;
        const fetchOrganisations = async () => {
            setLoadingOrganisations(true);
            try {
                const fetched = await getOrganisations();
                if (!cancelled) setOrganisationOptions(fetched);
            } catch (err) {
                console.error("Failed to fetch organisations:", err);
                if (!cancelled) setOrganisationOptions([]);
            } finally {
                if (!cancelled) setLoadingOrganisations(false);
            }
        };
        fetchOrganisations();
        return () => { cancelled = true; };
    }, []);

    const emailIsValid = isValidEmail(email);
    const passwordIsValid = isValidPassword(password);
    const passwordsAreEqual = passwordsMatch(password, confirm);

    const formIsValid =
        isNonEmpty(firstName) &&
        isNonEmpty(lastName) &&
        emailIsValid &&
        passwordIsValid &&
        passwordsAreEqual &&
        isNonEmpty(organisation) &&
        isNonEmpty(countryCode) &&
        isNonEmpty(usage);

    const handleSubmit = async () => {
        if (!formIsValid || submitting) return;
        setError(null);
        setSubmitting(true);
        try {
            await registerUser({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim(),
                password,
                organisation: organisation.trim(),
                country: countryCode,
                user_planned_usage: usage.trim(),
            });
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create user.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pr: 6 }}>
                Create user
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    disabled={submitting}
                    sx={{ position: "absolute", right: 8, top: 8 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
                    <Grid container spacing={2} sx={{ mt: 0 }}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth required label="First name"
                                value={firstName} onChange={(e) => setFirstName(e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth required label="Last name"
                                value={lastName} onChange={(e) => setLastName(e.target.value)}
                            />
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                fullWidth required label="Email"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                error={isNonEmpty(email) && !emailIsValid}
                                helperText={!emailIsValid && isNonEmpty(email) ? VALIDATION_MESSAGES.EMAIL_INVALID : " "}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <PasswordInput
                                fullWidth required label="Password"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                error={isNonEmpty(password) && !passwordIsValid}
                                helperText={isNonEmpty(password) && !passwordIsValid ? VALIDATION_MESSAGES.PASSWORD_REQ : " "}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <PasswordInput
                                fullWidth required label="Confirm password"
                                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                error={isNonEmpty(confirm) && !passwordsAreEqual}
                                helperText={!passwordsAreEqual && isNonEmpty(confirm) ? VALIDATION_MESSAGES.PASSWORD_MISMATCH : " "}
                            />
                        </Grid>
                        <Grid size={12}>
                            <Autocomplete
                                freeSolo fullWidth options={organisationOptions}
                                value={organisation}
                                onInputChange={(_, newValue) => setOrganisation(newValue)}
                                loading={loadingOrganisations}
                                renderInput={(params) => (
                                    <TextField
                                        {...params} required label="Organisation"
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {loadingOrganisations ? <CircularProgress size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                            />
                        </Grid>
                        <Grid size={12}>
                            <Autocomplete
                                fullWidth options={countryOptions}
                                getOptionLabel={(o) => o.name}
                                isOptionEqualToValue={(o, v) => o.code === v.code}
                                value={countryOptions.find((c) => c.code === countryCode) ?? null}
                                onChange={(_, newValue) => setCountryCode(newValue ? newValue.code : "")}
                                renderInput={(params) => <TextField {...params} required label="Country" />}
                            />
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                fullWidth required multiline minRows={3} label="Planned usage"
                                value={usage} onChange={(e) => setUsage(e.target.value)}
                            />
                        </Grid>
                    </Grid>
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!formIsValid || submitting}
                    data-testid="create-user-submit"
                >
                    {submitting ? "Creating..." : "Create user"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
