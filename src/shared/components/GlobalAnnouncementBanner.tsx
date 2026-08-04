import { useEffect } from "react";
import { Box, Alert, AlertTitle, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import {
    useAnnouncementStore,
    isBroadcastVisible,
    toAnnouncementView,
} from "@/features/admin/store/announcement.store";

/**
 * GlobalAnnouncementBanner — renders the admin site-wide broadcast (set from the
 * admin UPDATES tab) on every page, in the layout style the admin chose.
 *
 * Mounted once in `MainLayout`, so it appears above the content of every
 * authenticated page. It fetches the current broadcast from the backend on
 * mount; dismissing it hides the banner for this viewer (persisted per message)
 * without deleting it, and a newly pushed message reappears for everyone.
 */
export default function GlobalAnnouncementBanner() {
    // A single shallow-compared selector, so the fields are read from one
    // consistent snapshot and the component re-renders at most once per update.
    const { broadcast, dismissedKey, refresh, dismiss } = useAnnouncementStore(
        useShallow((s) => ({
            broadcast: s.broadcast,
            dismissedKey: s.dismissedKey,
            refresh: s.refresh,
            dismiss: s.dismiss,
        })),
    );

    // Pull the latest broadcast whenever the layout mounts (i.e. on navigation),
    // so a message an admin just pushed shows up without a full reload.
    useEffect(() => {
        void refresh();
    }, [refresh]);

    if (!isBroadcastVisible(broadcast, dismissedKey)) return null;

    const view = toAnnouncementView(broadcast);

    return (
        <Box sx={{ px: 3, pt: 2 }}>
            {/*
              * The banner reads in the same semantic colour as its frame, in bold,
              * over a background tinted with that colour at 80% transparency.
              */}
            <Alert
                severity={view.severity}
                onClose={dismiss}
                sx={{
                    border: "1px solid",
                    borderColor: `${view.severity}.main`,
                    color: `${view.severity}.main`,
                    bgcolor: (theme: Theme) => alpha(theme.palette[view.severity].main, 0.2),
                    "& .MuiAlert-icon, & .MuiAlert-action": { color: `${view.severity}.main` },
                }}
            >
                <AlertTitle sx={{ mb: view.subMessage ? 0.5 : 0, fontWeight: 700, color: "inherit" }}>
                    {view.message}
                </AlertTitle>
                {view.subMessage && (
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "inherit" }}>
                        {view.subMessage}
                    </Typography>
                )}
            </Alert>
        </Box>
    );
}
