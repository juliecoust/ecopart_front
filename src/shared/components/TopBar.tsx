import { useState, MouseEvent } from "react";
import {
    AppBar,
    Box,
    Toolbar,
    Typography,
    Stack,
    Menu,
    MenuItem,
    Divider,
    IconButton,
    Button
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import CloudIcon from "@mui/icons-material/Cloud";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { API_BASE_URL } from '@/config/api';
import { ecotaxaColors } from "@/theme";

import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/features/auth";

export default function TopBar() {
    const navigate = useNavigate();
    const { isAuthenticated, user, clearUser } = useAuthStore();

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleOpen = (event: MouseEvent<HTMLElement>) =>
        setAnchorEl(event.currentTarget);

    const handleClose = () => setAnchorEl(null);

    const handleLogout = async () => {
        try {
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } finally {
            clearUser();
            navigate("/");
        }
    };


    return (
        <AppBar position="static">
            <Toolbar sx={{ justifyContent: "space-between" }}>
                {/* Logo */}
                <Box
                    component={RouterLink}
                    to="/"
                    sx={{
                        display: "flex",
                        alignItems: "stretch",
                        height: "100%",
                        textDecoration: "none",
                    }}
                >
                    <Box
                        component="img"
                        // White variant of the logo (transparent background) so
                        // it reads on the teal gradient header. The default
                        // dark-on-white logo is kept for light surfaces
                        // (auth pages, EcoTaxa login form).
                        src="/logo_ecopart_white.png"
                        alt="EcoPart"
                        sx={{
                            height: "100%",
                            maxHeight: "64px", // default MUI AppBar height
                            objectFit: "contain",
                        }}
                    />
                </Box>


                {/* Navigation */}
                <Stack direction="row" spacing={3}>
                    <NavLink to="/about" label="About" />
                    <NavLink to="/explore" label="Explore" />
                    <NavLink to="https://ecotaxa.obs-vlfr.fr/" label="EcoTaxa" />
                    {isAuthenticated && (
                        <>
                            <NavLink to="/projects" label="Projects" />
                            <NavLink to="/tasks" label="Tasks" />

                            {user?.is_admin && (
                                <NavLink to="/admin" label="Admin" />
                            )}
                        </>
                    )}

                </Stack>

                {/* User */}
                {isAuthenticated && user ? (
                    <>
                        <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            onClick={handleOpen}
                            sx={{ cursor: "pointer", color: "common.white" }}
                        >
                            <Typography>
                                {user.first_name} {user.last_name}
                            </Typography>

                            <IconButton size="large" sx={{ color: "common.white" }}>
                                <AccountCircleIcon fontSize="large" />
                            </IconButton>
                        </Stack>

                        <Menu
                            anchorEl={anchorEl}
                            open={open}
                            onClose={handleClose}
                            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                            transformOrigin={{ vertical: "top", horizontal: "right" }}
                        >
                            <Box sx={{ px: 2, py: 1 }}>
                                <Typography fontWeight={600}>
                                    {user.first_name} {user.last_name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {user.email}
                                </Typography>
                            </Box>

                            <Divider />

                            {/* Navigate to the EcoPart account tab. The user's own id is
                                part of the settings URL (/settings/:userId/:tabName). */}
                            <MenuItem onClick={() => {
                                handleClose();
                                navigate(`/settings/${user.user_id}/ecopart_account`);
                            }}>
                                <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
                                Settings
                            </MenuItem>

                            {/* Navigate straight to the EcoTaxa accounts tab */}
                            <MenuItem onClick={() => {
                                handleClose();
                                navigate(`/settings/${user.user_id}/ecotaxa_account`);
                            }}>
                                <CloudIcon fontSize="small" sx={{ mr: 1 }} />
                                EcoTaxa account
                            </MenuItem>

                            <Divider />

                            <MenuItem onClick={handleLogout}>
                                <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
                                Log out
                            </MenuItem>
                        </Menu>
                    </>
                ) : (
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="outlined"
                            onClick={() => navigate("/login")}
                            sx={{
                                minWidth: 110,
                                color: "common.white",
                                borderColor: "rgba(255, 255, 255, 0.6)",
                                "&:hover": {
                                    borderColor: "common.white",
                                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                                },
                            }}
                        >
                            Log in
                        </Button>
                        <Button
                            variant="contained"
                            onClick={() => navigate("/register")}
                            sx={{
                                minWidth: 110,
                                backgroundColor: "common.white",
                                color: "primary.main",
                                "&:hover": {
                                    backgroundColor: ecotaxaColors.secondblue[50],
                                },
                            }}
                        >
                            Register
                        </Button>
                    </Stack>
                )}

            </Toolbar>
        </AppBar>
    );
}

function NavLink({ to, label }: { to: string; label: string }) {
    const { pathname } = useLocation();
    const isExternal = to.startsWith("http");
    // Active when on the exact route or a nested route (e.g. /projects stays
    // active on /projects/:id/...). External links are never "active".
    const active =
        !isExternal && (pathname === to || pathname.startsWith(to + "/"));

    return (
        <Typography
            component={RouterLink}
            to={to}
            sx={{
                textDecoration: "none",
                color: "common.white",
                fontWeight: 500,
                pb: 0.5,
                borderBottom: "2px solid",
                borderColor: active ? "common.white" : "transparent",
                transition: "color 0.2s ease-in-out, border-color 0.2s ease-in-out",
                "&:hover": {
                    color: active ? "common.white" : ecotaxaColors.secondblue[200],
                },
            }}
        >
            {label}
        </Typography>
    );
}