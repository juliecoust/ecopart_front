import { createBrowserRouter } from "react-router-dom";

import { ProtectedRoute } from "@/app/ProtectedRoute";
import { PublicOnlyRoute } from "@/app/PublicOnlyRoute";
import AdminRoute from "@/app/AdminRoute";
import { HomePage } from "@/features/home";
import { AdminPage } from "@/features/admin";
import { LoginPage, RegisterPage, ResetPasswordPage, ResetPasswordConfirmPage, ValidateEmailPage } from "@/features/auth";
import { DashboardPage } from "@/features/dashboard";
import { NotFoundPage } from "@/features/errors";
import { ProfilePage } from "@/features/userProfile";
import ProjectsPage from "@/features/projects/pages/ProjectsPage";
import NewProjectPage from "@/features/projects/pages/NewProjectPage";
import ProjectDetailsPage from "@/features/projects/pages/ProjectDetailsPage";
import TaskDetailsPage from "@/features/projects/pages/TaskDetailsPage";
import TasksPage from "@/features/projects/pages/TasksPage";

export const router = createBrowserRouter([
    { path: "/", element: <HomePage /> },
    {
        path: "/login",
        element: (
            <PublicOnlyRoute>
                <LoginPage />
            </PublicOnlyRoute>
        ),
    },
    {
        path: "/dashboard",
        element: (
            <ProtectedRoute>
                <DashboardPage />
            </ProtectedRoute>
        ),
    },
    {
        path: "/reset-password",
        element: <ResetPasswordPage />,
    },
    {
        path: "/reset-password/:token",
        element: <ResetPasswordConfirmPage />,
    },
    {
        path: "/register",
        element: (
            <PublicOnlyRoute>
                <RegisterPage />
            </PublicOnlyRoute>
        ),
    },
    {
        path: "/users/:user_id/welcome/:token",
        element: <ValidateEmailPage />,
    },
    {
        // Canonical form is /settings/:userId/:tabName. The legacy /settings/:tabName
        // (no id) is still accepted — ProfilePage disambiguates a numeric first
        // segment (a user id) from a tab slug and defaults to the logged-in user.
        path: "/settings/:userId?/:tabName?",
        element: (
            <ProtectedRoute>
                <ProfilePage />
            </ProtectedRoute>
        ),
    },
    {
        path: "/projects",
        element: (
            <ProtectedRoute>
                <ProjectsPage />
            </ProtectedRoute>
        ),
    },
    {
        path: "/new-project",
        element: (
            <ProtectedRoute>
                <NewProjectPage />
            </ProtectedRoute>
        ),
    },

    {
        path: "/projects/:id/:tabName?",
        element: (
            <ProtectedRoute>
                <ProjectDetailsPage />
            </ProtectedRoute>
        ),
    },
    {
        path: "/projects/:id/:tabName",
        element: (
            <ProtectedRoute>
                <ProjectDetailsPage />
            </ProtectedRoute>
        ),
    },
    {
        path: "/projects/:id/tasks/:taskId/:tabName?",
        element: (
            <ProtectedRoute>
                <TaskDetailsPage />
            </ProtectedRoute>
        )
    },
    {
        path: "/tasks",
        element: (
            <ProtectedRoute>
                <TasksPage />
            </ProtectedRoute>
        ),
    },
    {
        // Global task detail (opened from the /tasks list, no project context).
        path: "/tasks/:taskId/:tabName?",
        element: (
            <ProtectedRoute>
                <TaskDetailsPage />
            </ProtectedRoute>
        ),
    },

    {
        path: "/admin/:tabName?",
        element: (
            <AdminRoute>
                <AdminPage />
            </AdminRoute>
        ),
    },
    { path: "*", element: <NotFoundPage /> },
]);
