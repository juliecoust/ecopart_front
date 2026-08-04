import {
    Box, Typography, Button, TextField, Paper, Alert, AlertTitle,
    FormControlLabel, Checkbox, Radio, RadioGroup, Snackbar, CircularProgress,
} from "@mui/material";

import {
    AnnouncementSeverity,
    Announcement,
} from "../store/announcement.store";
import { ANNOUNCEMENT_STYLES, useAdminUpdates } from "../hooks/useAdminUpdates";

/**
 * One coloured "layout style" chip (Info / Warning / Error) used as a radio label.
 * The border/text pick up the matching semantic palette colour so the admin sees
 * exactly how the banner will read before broadcasting it.
 */
const StyleChip = ({ severity, label }: { severity: AnnouncementSeverity; label: string }) => (
    <Box
        component="span"
        sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: `${severity}.main`,
            color: `${severity}.main`,
            bgcolor: (theme) => theme.palette[severity].light + "1A", // ~10% tint
            fontWeight: 500,
        }}
    >
        {label}
    </Box>
);

/** The persisted announcement, rendered exactly as the global banner shows it. */
const ActiveAnnouncement = ({
    announcement,
    onRemove,
}: {
    announcement: Announcement;
    onRemove: () => void;
}) => (
    <Alert severity={announcement.severity} onClose={onRemove}>
        <AlertTitle sx={{ mb: announcement.subMessage ? 0.5 : 0 }}>
            {announcement.message}
        </AlertTitle>
        {announcement.subMessage && (
            <Typography variant="body2" color="text.secondary">
                {announcement.subMessage}
            </Typography>
        )}
    </Alert>
);

/**
 * AdminUpdatesTab — the "UPDATES" panel of the EcoPart administration page.
 *
 * Lets an admin broadcast a single site-wide message (with a layout style) that
 * the global banner then shows on every page. While a message is active the tab
 * displays it (with a remove button) instead of the creation form.
 */
export default function AdminUpdatesTab() {
    const {
        activeAnnouncement, justCreated, dismissJustCreated,
        message, setMessage,
        subMessage, setSubMessage,
        severity, setSeverity,
        confirmed, setConfirmed,
        canCreate, create, remove,
        submitting, error, dismissError,
    } = useAdminUpdates();

    return (
        <Box>
            <Paper variant="outlined" sx={{ width: "100%", overflow: "hidden" }}>
                {/* CARD HEADER */}
                <Box sx={{ p: 3, borderBottom: "1px solid #e0e0e0" }}>
                    <Typography variant="h6">Message update</Typography>
                </Box>

                <Box sx={{ p: 4 }}>
                    {activeAnnouncement ? (
                        <ActiveAnnouncement announcement={activeAnnouncement} onRemove={remove} />
                    ) : (
                        <>
                            <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                                Show message to all users
                            </Typography>

                            <TextField
                                label="Message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                fullWidth
                                multiline
                                minRows={2}
                                sx={{ maxWidth: 520, display: "block", mb: 3 }}
                            />

                            <TextField
                                label="Sub message"
                                value={subMessage}
                                onChange={(e) => setSubMessage(e.target.value)}
                                fullWidth
                                sx={{ maxWidth: 520, display: "block", mb: 3 }}
                            />

                            <Typography variant="body1" color="text.secondary" gutterBottom>
                                Message layout style
                            </Typography>
                            <RadioGroup
                                row
                                value={severity}
                                onChange={(e) => setSeverity(e.target.value as AnnouncementSeverity)}
                                sx={{ gap: 3, mb: 1 }}
                            >
                                {ANNOUNCEMENT_STYLES.map((style) => (
                                    <FormControlLabel
                                        key={style.value}
                                        value={style.value}
                                        control={<Radio />}
                                        label={<StyleChip severity={style.value} label={style.label} />}
                                    />
                                ))}
                            </RadioGroup>

                            <FormControlLabel
                                sx={{ alignItems: "flex-start", mb: 2, maxWidth: 520 }}
                                control={
                                    <Checkbox
                                        checked={confirmed}
                                        onChange={(e) => setConfirmed(e.target.checked)}
                                        sx={{ pt: 0 }}
                                    />
                                }
                                label={
                                    <Typography variant="body2">
                                        This message will be visible on each page of the application
                                        for all users. Are you sure about your message?
                                    </Typography>
                                }
                            />

                            <Button
                                variant="contained"
                                onClick={create}
                                disabled={!canCreate}
                                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={{ display: "block", maxWidth: 520, width: "100%" }}
                            >
                                Create
                            </Button>
                        </>
                    )}
                </Box>
            </Paper>

            {/* Transient confirmation shown right after a message is created. */}
            <Snackbar
                open={justCreated}
                autoHideDuration={6000}
                onClose={dismissJustCreated}
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
            >
                <Alert
                    severity={activeAnnouncement?.severity ?? "info"}
                    onClose={dismissJustCreated}
                    variant="outlined"
                    sx={{ bgcolor: "background.paper" }}
                >
                    <AlertTitle sx={{ mb: activeAnnouncement?.subMessage ? 0.5 : 0 }}>
                        {activeAnnouncement?.message}
                    </AlertTitle>
                    {activeAnnouncement?.subMessage && (
                        <Typography variant="body2" color="text.secondary">
                            {activeAnnouncement.subMessage}
                        </Typography>
                    )}
                </Alert>
            </Snackbar>

            {/* Surfaces a failed publish/remove request. */}
            <Snackbar
                open={!!error}
                autoHideDuration={6000}
                onClose={dismissError}
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
            >
                <Alert severity="error" onClose={dismissError} variant="filled">
                    {error}
                </Alert>
            </Snackbar>
        </Box>
    );
}
