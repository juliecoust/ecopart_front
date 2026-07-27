import {
    Box,
    Button,
    Container,
    TextField,
    Typography,
    Tabs,
    Tab,
    Paper,
    Autocomplete,
    Divider,
    Alert,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Stack,
    Chip,
    Checkbox,
    FormControlLabel,
    IconButton // Added for the logout icon
} from "@mui/material";
import Grid from "@mui/material/Grid";
import PersonIcon from "@mui/icons-material/Person";
import CloudIcon from "@mui/icons-material/Cloud";
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'; // Icon for admin
// icons for the list view to match mockup
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import InfoTooltip from "@/shared/components/InfoTooltip";

// useParams drives the active tab from the URL (/settings/:tabName);
// useLocation still supports the legacy `state.activeTab` navigation.
import { useNavigate, useLocation, useParams } from "react-router-dom";

// Shared components & layouts
import MainLayout from "@/app/layouts/MainLayout";
import { CountriesWrapper, CountryOption } from "@/shared/country-wrapper";
import { PasswordInput } from "@/shared/components/PasswordInput";

import { useEffect, useMemo, useState, useCallback, type SyntheticEvent } from "react";

// Validation utils
import {
    isNonEmpty,
    isValidPassword,
    passwordsMatch,
} from "@/shared/utils/validation";
import { VALIDATION_MESSAGES } from "@/shared/utils/validation/messages";

// Feature imports (Local API)
// Added getEcoTaxaAccounts, EcoTaxaAccountLink and unlinkEcoTaxaAccount to imports
import {
    fetchMe,
    updateProfile,
    changePassword,
    deleteAccount,
    // linkEcoTaxaAccount, <-- REMOVED: handled by child component now
    getEcoTaxaAccounts, // API call
    unlinkEcoTaxaAccount, // API call for unlinking
    type EcoTaxaAccountLink // Type
} from "../api/profile.api";
// Admin-only single-user lookup: the settings page can edit another account when
// the logged-in user is an admin (/settings/:userId/...).
import { getUserById } from "@/features/admin/api/adminUsers.api";
import { User } from "@/features/auth/types/user";
import { ecotaxaColors } from "@/theme";

// Auth Store (to logout user after deletion)
import { useAuthStore } from "@/features/auth/store/auth.store";

// IMPORT: The extracted Login Form Component
import { EcoTaxaLoginForm } from "../components/EcoTaxaLoginForm";

/* ---------------- CONSTANTS ---------------- */
const organisationTypes = [
    { value: "Sorbonne Université", label: "Sorbonne Université" },
    { value: "CNRS", label: "CNRS" },
];

// NOTE: ECOTAXA_INSTANCES constant has been moved to EcoTaxaLoginForm component
// as it is specific to the form logic.

export default function ProfilePage() {
    const navigate = useNavigate();
    // Initialize the location hook
    const location = useLocation();

    // authUser is the logged-in user (drives permissions & self-detection);
    // setUser keeps the store in sync after editing one's own profile.
    const { user: authUser, setUser, clearUser } = useAuthStore();

    // Canonical URL is /settings/:userId/:tabName. For backward compatibility we
    // also accept /settings/:tabName (no id): a non-numeric first segment is the
    // tab slug, and the target user defaults to the logged-in user.
    const { userId: userIdParam, tabName: tabNameParam } = useParams<{ userId?: string; tabName?: string }>();
    const firstSegmentIsNumeric = userIdParam != null && /^\d+$/.test(userIdParam);
    const routeUserId = firstSegmentIsNumeric ? Number(userIdParam) : null;
    const tabName = firstSegmentIsNumeric ? tabNameParam : (userIdParam ?? tabNameParam);

    // The active tab is driven by the URL slug.
    // Falls back to the legacy `location.state.activeTab`, then to tab 0.
    const TAB_SLUGS = ["ecopart_account", "ecotaxa_account"] as const;
    const slugIndex = tabName ? TAB_SLUGS.indexOf(tabName as typeof TAB_SLUGS[number]) : -1;
    const stateTab = typeof location.state?.activeTab === "number" ? location.state.activeTab : -1;
    const tabValue = slugIndex >= 0 ? slugIndex : (stateTab >= 0 ? stateTab : 0);

    const handleTabChange = (_e: SyntheticEvent, newValue: number) => {
        const slug = TAB_SLUGS[newValue] ?? TAB_SLUGS[0];
        // Keep the account id in the URL (falls back to the logged-in user's id
        // for the legacy no-id form).
        const idForUrl = routeUserId ?? authUser?.user_id;
        navigate(idForUrl != null ? `/settings/${idForUrl}/${slug}` : `/settings/${slug}`);
    };

    const [loadingUser, setLoadingUser] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // --- STATES: PROFILE ---
    // `currentUser` = logged-in user; `user` = the account being edited (they
    // differ only when an admin edits someone else via /settings/:userId/...).
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [user, setUserData] = useState<User | null>(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [organisation, setOrganisation] = useState("");
    const [countryCode, setCountryCode] = useState<string>("");
    const [plannedUsage, setPlannedUsage] = useState("");
    // Admin flag, edited as a form field (only admins can toggle it) and saved with the profile.
    const [isAdmin, setIsAdmin] = useState(false);

    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // --- STATES: PASSWORD ---
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // --- STATES: DELETE ACCOUNT (Global EcoPart) ---
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // --- STATES: ECOTAXA LINK ---
    // REMOVED: All local states for the form (etEmail, etPassword, etc.) have been moved to the child component.
    // This dramatically cleans up the parent component and prevents state pollution.

    // --- STATES: LINKED ACCOUNTS LIST & UNLINK ---
    const [linkedAccounts, setLinkedAccounts] = useState<EcoTaxaAccountLink[]>([]);
    const [showLinkForm, setShowLinkForm] = useState(false);
    // When reconnecting an expired account, seed the form with its email + instance.
    const [reconnectTarget, setReconnectTarget] = useState<{ email: string; instanceId: number } | null>(null);

    // states for the Unlink Confirmation Dialog
    const [openUnlinkDialog, setOpenUnlinkDialog] = useState(false);
    const [accountToUnlink, setAccountToUnlink] = useState<number | null>(null);


    const countryOptions = useMemo<CountryOption[]>(
        () => CountriesWrapper.list(),
        []
    );

    // --- HELPERS ---
    const fetchLinkedAccounts = useCallback(async (userId: number) => {
        try {
            const accounts = await getEcoTaxaAccounts(userId);
            setLinkedAccounts(accounts);
            // Logic: If user has accounts, default to list view (hide form). 
            // If no accounts, show form.
            if (accounts && accounts.length > 0) {
                setShowLinkForm(false);
            } else {
                setShowLinkForm(true);
            }
        } catch (err) {
            console.error("Failed to load linked accounts", err);
            // SAFETY NET: If the API fails, show the form so the user isn't stuck on an empty screen
            setLinkedAccounts([]);
            setShowLinkForm(true);
        }
    }, []);

    // --- INITIAL LOAD ---
    useEffect(() => {
        const loadUserData = async () => {
            setLoadingUser(true);
            setLoadError(null);
            try {
                // Always resolve the logged-in user first (permissions + self check).
                const me = await fetchMe();
                setCurrentUser(me);

                // Decide which account to edit. Defaults to self; an id in the URL
                // targets another account (admins only — others are redirected).
                let target: User = me;
                if (routeUserId != null && routeUserId !== me.user_id) {
                    if (!me.is_admin) {
                        navigate(`/settings/${me.user_id}/ecopart_account`, { replace: true });
                        return;
                    }
                    const fetched = await getUserById(routeUserId);
                    if (!fetched) {
                        setLoadError(`No user found with id ${routeUserId}.`);
                        setUserData(null);
                        return;
                    }
                    // AdminUser is a structural superset of User.
                    target = fetched as User;
                }

                setUserData(target);
                setFirstName(target.first_name || "");
                setLastName(target.last_name || "");
                setEmail(target.email || "");
                setOrganisation(target.organisation || "");
                const code = target.country ? target.country.toUpperCase() : "";
                const isValidCode = countryOptions.some((c) => c.code === code);
                setCountryCode(isValidCode ? code : "");
                setPlannedUsage(target.user_planned_usage || "");
                setIsAdmin(!!target.is_admin);

                // Load connected accounts for the account being edited.
                fetchLinkedAccounts(target.user_id);

            } catch (error) {
                console.error("Failed to load user", error);
                setLoadError("Failed to load account.");
            } finally {
                setLoadingUser(false);
            }
        };

        loadUserData();
    }, [countryOptions, fetchLinkedAccounts, routeUserId, navigate]);

    // Whether the account being edited is the logged-in user (vs an admin editing
    // someone else). Password change and store-sync only apply to one's own account.
    const isEditingSelf = !!currentUser && !!user && currentUser.user_id === user.user_id;

    const getDaysLeft = (expirationDate: string) => {
        if (!expirationDate) return 0;
        const today = new Date();
        const exp = new Date(expirationDate);
        const diffTime = exp.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    const getEcoTaxaAccountLabel = (account: EcoTaxaAccountLink) => {
        return account.ecotaxa_user_email || account.ecotaxa_user_login || account.ecotaxa_user_name;
    };

    // An account is expired once its expiration date is in the past.
    const isExpired = (expirationDate: string) => {
        if (!expirationDate) return false;
        return new Date(expirationDate).getTime() <= Date.now();
    };

    // --- HANDLERS ---

    // ... (Keep handleProfileSave, handleProfileCancel, handleChangePassword, handleDeleteClick, handleConfirmDelete AS IS) ...
    const handleProfileSave = async () => {
        if (!user) return;
        setProfileMessage(null);
        setProfileSaving(true);
        try {
            const payload: Partial<User> = {
                first_name: firstName, last_name: lastName, organisation, country: countryCode, user_planned_usage: plannedUsage,
            };
            // Only admins can change the admin flag; include it only then.
            if (currentUser?.is_admin) payload.is_admin = isAdmin;
            const updatedProfileData = await updateProfile(user.user_id, payload);
            const mergedUser = { ...user, ...updatedProfileData };
            setUserData(mergedUser);
            // Only sync the auth store when editing one's OWN account — an admin
            // editing another user must not overwrite their own identity.
            if (isEditingSelf) setUser(mergedUser); // keep TopBar Admin link in sync
            setProfileMessage({ type: "success", text: "Profile updated successfully." });
        } catch (err) {
            console.error(err);
            setProfileMessage({ type: "error", text: "Failed to update profile." });
        } finally { setProfileSaving(false); }
    };

    const handleProfileCancel = () => {
        if (user) {
            setFirstName(user.first_name || ""); setLastName(user.last_name || ""); setOrganisation(user.organisation || ""); setCountryCode(user.country || ""); setPlannedUsage(user.user_planned_usage || ""); setIsAdmin(!!user.is_admin); setProfileMessage(null);
        }
    };

    const handleChangePassword = async () => {
        if (!user || !isNonEmpty(currentPassword) || !isValidPassword(newPassword) || !passwordsMatch(newPassword, confirmPassword)) return;
        setPasswordMessage(null); setPasswordSaving(true);
        try {
            await changePassword(user.user_id, currentPassword, newPassword);
            setPasswordMessage({ type: "success", text: "Password changed successfully." });
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : "Failed to change password.";
            setPasswordMessage({ type: "error", text: msg });
        } finally { setPasswordSaving(false); }
    };

    const handleDeleteClick = () => { setOpenDeleteDialog(true); };

    const handleConfirmDelete = async () => {
        if (!user) return;
        setDeleteError(null);
        try {
            await deleteAccount(user.user_id);
            if (isEditingSelf) {
                // Deleting one's own account logs out and returns to login.
                clearUser();
                navigate("/login", { state: { successMessage: "Your account has been successfully deleted." } });
            } else {
                // An admin deleted someone else's account — return to the users list.
                navigate("/admin/users");
            }
        } catch (err) {
            console.error(err);
            setDeleteError("Failed to delete account. Please try again or contact support.");
            setOpenDeleteDialog(false);
        }
    };

    // --- REMOVED: handleLinkEcoTaxa ---
    // The logic is now inside the child component.

    // --- HANDLER: Callback from Child ---
    const handleLoginSuccess = async () => {
        if (!user) return;
        // 1. Refresh list
        await fetchLinkedAccounts(user.user_id);
        // 2. Hide form and clear any reconnect prefill (form remounts fresh next time)
        setShowLinkForm(false);
        setReconnectTarget(null);
    };

    // Reconnect an expired account: unlink it first, then open the link form
    // pre-filled with its email + instance so the user just re-enters the password.
    const [reconnecting, setReconnecting] = useState<number | null>(null);
    const handleReconnectClick = async (account: EcoTaxaAccountLink) => {
        if (!user) return;
        const target = {
            email: account.ecotaxa_user_email || account.ecotaxa_user_login || "",
            instanceId: account.ecotaxa_account_instance_id,
        };
        setReconnecting(account.ecotaxa_account_id);
        try {
            await unlinkEcoTaxaAccount(user.user_id, account.ecotaxa_account_id);
            await fetchLinkedAccounts(user.user_id);
        } catch (err) {
            console.error("Failed to unlink account before reconnecting", err);
        } finally {
            setReconnecting(null);
        }
        // Open the pre-filled form (fetchLinkedAccounts may have toggled it off).
        setReconnectTarget(target);
        setShowLinkForm(true);
    };

    // --- HANDLERS: ECOTAXA UNLINK ---

    // 1. User clicks the Logout icon -> Open confirmation dialog
    const handleUnlinkClick = (accountId: number) => {
        setAccountToUnlink(accountId);
        setOpenUnlinkDialog(true);
    };

    // 2. User confirms -> Call API and refresh list
    const handleConfirmUnlink = async () => {
        if (!user || accountToUnlink === null) return;

        try {
            await unlinkEcoTaxaAccount(user.user_id, accountToUnlink);
            // No global message needed here as the item just disappears from list
            // Refresh list
            await fetchLinkedAccounts(user.user_id);
        } catch (err) {
            console.error("Failed to unlink account", err);
            // Optional: set a global error message if needed
        } finally {
            setOpenUnlinkDialog(false);
            setAccountToUnlink(null);
        }
    };

    // --- VALIDATION LOGIC ---
    const passwordIsValid = isValidPassword(newPassword);
    const passwordsAreEqual = passwordsMatch(newPassword, confirmPassword);
    const canSavePassword = isNonEmpty(currentPassword) && isNonEmpty(newPassword) && passwordIsValid && passwordsAreEqual;
    const canSaveProfile = isNonEmpty(firstName) && isNonEmpty(lastName) && isNonEmpty(organisation) && isNonEmpty(countryCode) && isNonEmpty(plannedUsage);

    // REMOVED: canLinkEcoTaxa, selectedEtInstance (moved to child)

    if (loadingUser) {
        return (
            <MainLayout>
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
                    <CircularProgress />
                </Box>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <Container maxWidth="sm" sx={{ mt: 4, mb: 8, textAlign: "left" }}>

                <Typography variant="h4" sx={{ mb: 2 }}>Settings</Typography>

                {loadError && (
                    <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>
                )}

                <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab icon={<PersonIcon />} iconPosition="start" label="ECOPART ACCOUNT" />
                        <Tab icon={<CloudIcon />} iconPosition="start" label="ECOTAXA ACCOUNTS" />
                    </Tabs>
                </Box>

                {/* TAB 0: ECOPART PROFILE */}
                {tabValue === 0 && (
                    <>
                        <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="h6">
                                    {isEditingSelf ? "Profile" : `Edit user #${user?.user_id}`}
                                </Typography>
                                {currentUser?.is_admin && (
                                    <Button variant="contained" color="primary" size="small" startIcon={<AdminPanelSettingsIcon />} onClick={() => navigate('/admin')}>ADMIN DASHBOARD</Button>
                                )}
                            </Stack>
                            <Divider sx={{ mb: 3 }} />
                            {profileMessage && <Alert severity={profileMessage.type} sx={{ mb: 2 }}>{profileMessage.text}</Alert>}
                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="First name*"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="Last name*"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        label="Email"
                                        value={email}
                                        disabled
                                        helperText="Contact admin to change email"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <Autocomplete
                                        freeSolo
                                        fullWidth
                                        options={organisationTypes.map((o) => o.value)}
                                        value={organisation}
                                        onInputChange={(_, val) => setOrganisation(val)}
                                        renderInput={(params) => <TextField {...params} label="Organisation*"
                                        />}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <Autocomplete
                                        fullWidth
                                        options={countryOptions}
                                        getOptionLabel={(o) => o.name}
                                        isOptionEqualToValue={(option, value) => option.code === value.code}
                                        value={countryOptions.find((c) => c.code === countryCode) || null}
                                        onChange={(_, val) => setCountryCode(val ? val.code : "")
                                        }
                                        renderInput={(params) => <TextField {...params}
                                            label="Country*"
                                            error={!countryCode && !loadingUser}
                                            helperText={!countryCode && !loadingUser ? "Please select a country" : ""}
                                        />
                                        }
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        minRows={3}
                                        label="Planned usage*"
                                        value={plannedUsage}
                                        onChange={(e) => setPlannedUsage(e.target.value)}
                                        helperText="Describe briefly how you plan to use the data."
                                    />
                                </Grid>
                                {currentUser?.is_admin && (
                                    <Grid size={{ xs: 12 }}>
                                        <FormControlLabel
                                            control={<Checkbox checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />}
                                            label={
                                                <Typography variant="body1" component="span">
                                                    Administrator
                                                    <InfoTooltip
                                                        title={
                                                            <Typography variant="caption" component="p">
                                                                Grants full administrator access: manage all users, projects and tasks.
                                                                This option is only visible to administrators and takes effect after you save.
                                                            </Typography>
                                                        }
                                                    />
                                                </Typography>
                                            }
                                        />
                                    </Grid>
                                )}
                            </Grid>
                            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                                <Button variant="contained" onClick={handleProfileSave} disabled={profileSaving || !canSaveProfile}>{profileSaving ? "Saving..." : "SAVE"}</Button>
                                <Button variant="outlined" onClick={handleProfileCancel} disabled={profileSaving}>CANCEL</Button>
                            </Box>
                        </Paper>

                        {/* Password change requires the account's current password, so it
                            is only available when editing your own account. */}
                        {isEditingSelf && (
                        <>
                        <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
                            Security
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
                            <Typography variant="h6" gutterBottom>
                                Change password
                            </Typography>
                            <Divider sx={{ mb: 3 }} />

                            {passwordMessage && (
                                <Alert severity={passwordMessage.type} sx={{ mb: 2 }}>
                                    {passwordMessage.text}
                                </Alert>
                            )}

                            <Grid container spacing={2}>

                                <Grid size={{ xs: 12 }}>
                                    <PasswordInput
                                        fullWidth
                                        label="Current password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                    />
                                </Grid>

                                <Grid size={{ xs: 12 }}>
                                    <PasswordInput
                                        fullWidth
                                        label="New password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        error={isNonEmpty(newPassword) && !passwordIsValid}
                                        helperText={
                                            isNonEmpty(newPassword) && !passwordIsValid
                                                ? VALIDATION_MESSAGES.PASSWORD_REQ
                                                : " "
                                        }
                                    />
                                </Grid>

                                <Grid size={{ xs: 12 }}>
                                    <PasswordInput
                                        fullWidth
                                        label="Re-type new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        error={isNonEmpty(confirmPassword) && !passwordsAreEqual}
                                        helperText={
                                            isNonEmpty(confirmPassword) && !passwordsAreEqual
                                                ? VALIDATION_MESSAGES.PASSWORD_MISMATCH
                                                : " "
                                        }
                                    />
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 3 }}>
                                <Button
                                    variant="outlined"
                                    onClick={handleChangePassword}
                                    disabled={!canSavePassword || passwordSaving}
                                >
                                    {passwordSaving ? "Changing..." : "CHANGE"}
                                </Button>
                            </Box>
                        </Paper>
                        </>
                        )}

                        {/* --- SECTION: DELETE ACCOUNT --- */}
                        <Paper variant="outlined" sx={{ p: 3 }}>
                            <Typography variant="h6" gutterBottom>
                                Delete account
                            </Typography>
                            <Divider sx={{ mb: 2 }} />

                            {deleteError && (
                                <Alert severity="error" sx={{ mb: 2 }}>
                                    {deleteError}
                                </Alert>
                            )}

                            <Typography variant="body2" color="text.secondary" paragraph>
                                {isEditingSelf
                                    ? "Your account will be deactivated. You will not be able to connect to EcoPart anymore. " +
                                      "Please transfer access permissions for any projects you manage before deleting your account. " +
                                      "To completely delete your account, please send an email to contact@ecopart.fr"
                                    : "This account will be deactivated and the user will no longer be able to connect to EcoPart. " +
                                      "Please transfer access permissions for any projects they manage first. " +
                                      "To completely delete the account, please send an email to contact@ecopart.fr"}
                            </Typography>

                            <Button
                                variant="outlined"
                                color="error"
                                sx={{ mt: 1 }}
                                onClick={handleDeleteClick}
                            >
                                DELETE
                            </Button>
                        </Paper>
                    </>
                )}

                {/* TAB 1: ECOTAXA LINK */}
                {tabValue === 1 && (
                    <Box>
                        <Typography variant="h6" gutterBottom>Accounts on EcoTaxa instances</Typography>

                        {/* CONNECTED ACCOUNTS — always visible (the form appears below, never hides them) */}
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            {linkedAccounts.map((account) => {
                                const expired = isExpired(account.ecotaxa_expiration_date);
                                return (
                                    <Paper
                                        key={account.ecotaxa_account_id}
                                        variant="outlined"
                                        sx={{
                                            p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            backgroundColor: expired ? ecotaxaColors.danger[50] : ecotaxaColors.secondblue[50],
                                            borderColor: expired ? 'error.light' : ecotaxaColors.secondblue[200]
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            {expired
                                                ? <ErrorOutlineIcon sx={{ fontSize: 40, color: 'error.main' }} />
                                                : <CheckCircleOutlineIcon sx={{ fontSize: 40, color: 'text.secondary' }} />}
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {getEcoTaxaAccountLabel(account)}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    Instance: {account.ecotaxa_account_instance_name}
                                                </Typography>
                                                {expired
                                                    ? <Chip label="Expired" color="error" size="small" variant="outlined" sx={{ mt: 0.5 }} />
                                                    : <Typography variant="body2" color="text.secondary">
                                                        {getDaysLeft(account.ecotaxa_expiration_date)} days left
                                                    </Typography>}
                                            </Box>
                                        </Box>

                                        <Stack direction="row" spacing={1} alignItems="center">
                                            {expired && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    color="primary"
                                                    startIcon={<ReplayIcon />}
                                                    disabled={reconnecting === account.ecotaxa_account_id}
                                                    onClick={() => handleReconnectClick(account)}
                                                >
                                                    {reconnecting === account.ecotaxa_account_id ? "Removing…" : "Reconnect"}
                                                </Button>
                                            )}
                                            <IconButton
                                                size="small"
                                                color="primary"
                                                onClick={() => handleUnlinkClick(account.ecotaxa_account_id)}
                                                aria-label="Disconnect EcoTaxa account"
                                            >
                                                <LogoutIcon />
                                            </IconButton>
                                        </Stack>
                                    </Paper>
                                );
                            })}

                            {/* Add-account trigger — hidden while the form is open */}
                            {!showLinkForm && (
                                <Button
                                    variant="outlined" color="inherit" fullWidth startIcon={<AddIcon />}
                                    onClick={() => { setReconnectTarget(null); setShowLinkForm(true); }}
                                    sx={{ justifyContent: 'flex-start', p: 2, textTransform: 'none', borderColor: 'divider', color: 'text.primary' }}
                                >
                                    Connect to another account
                                </Button>
                            )}
                        </Stack>

                        {/* FORM — appears below the list, seeded for reconnect when applicable */}
                        {showLinkForm && user && (
                            <Paper variant="outlined" sx={{ p: 4, mt: 2 }}>
                                <EcoTaxaLoginForm
                                    key={reconnectTarget?.email ?? 'new'}
                                    userId={user.user_id}
                                    onSuccess={handleLoginSuccess}
                                    onCancel={() => { setShowLinkForm(false); setReconnectTarget(null); }}
                                    showCancelButton={linkedAccounts.length > 0}
                                    initialEmail={reconnectTarget?.email}
                                    initialInstanceId={reconnectTarget?.instanceId}
                                />
                            </Paper>
                        )}
                    </Box>
                )}

                {/* EXISTING DELETE ECOPART DIALOG */}
                <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
                    <DialogTitle>Delete Account?</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            {isEditingSelf
                                ? "Are you sure you want to delete your account? This action cannot be undone."
                                : `Are you sure you want to delete the account of ${user?.first_name ?? ""} ${user?.last_name ?? ""} (#${user?.user_id})? This action cannot be undone.`}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
                        <Button onClick={handleConfirmDelete} color="error" autoFocus>Delete</Button>
                    </DialogActions>
                </Dialog>

                {/* UNLINK CONFIRMATION DIALOG */}
                <Dialog open={openUnlinkDialog} onClose={() => setOpenUnlinkDialog(false)}>
                    <DialogTitle>Disconnect EcoTaxa Account?</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            Are you sure you want to disconnect this EcoTaxa account? You will need to log in again to access its data.
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenUnlinkDialog(false)}>Cancel</Button>
                        <Button onClick={handleConfirmUnlink} color="primary" autoFocus>Disconnect</Button>
                    </DialogActions>
                </Dialog>

            </Container>
        </MainLayout>
    );
}