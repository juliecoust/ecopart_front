import { http } from "@/shared/api/http";
import type { SearchFilter } from "@/features/projects/api/projects.api";

/**
 * A user row as returned to an admin by POST /users/searches.
 *
 * For an admin caller the backend returns the full `UserResponseModel`
 * (see ecopart_back search-users.ts → adminGetUsers), so `valid_email` and
 * `deleted` are present and drive the account-status column. `manager_count`
 * and `member_count` are NOT part of the user model — the USERS tab derives them
 * client-side via `countProjectsForUser` (projects search by managers/members),
 * so they stay optional and are filled in once that lookup resolves.
 */
export interface AdminUser {
    user_id: number;
    first_name: string;
    last_name: string;
    email: string;
    organisation: string;
    country: string;
    user_planned_usage: string;
    is_admin: boolean;
    user_creation_utc_date_time: string;
    valid_email?: boolean;
    deleted?: string | null;

    // Not backend-provided (see note above); rendered as "—" when absent.
    manager_count?: number;
    member_count?: number;
}

export interface UserSearchResponse {
    search_info: {
        total: number;
        page: number;
        limit: number;
    };
    users: AdminUser[];
}

export interface UserSearchParams {
    page: number;
    limit: number;
    filters: SearchFilter[];
    sort_by?: string;
}

/**
 * Search users (admin console). POST /users/searches with pagination in the
 * query string and an array of filters in the body.
 */
export async function searchUsers(params: UserSearchParams): Promise<UserSearchResponse> {
    const query = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
    });

    if (params.sort_by) {
        query.set("sort_by", params.sort_by);
    }

    return http<UserSearchResponse>(`/users/searches?${query.toString()}`, {
        method: "POST",
        body: JSON.stringify(params.filters ?? []),
    });
}

/**
 * Grant or revoke admin rights for a user.
 * Route: PATCH /users/:user_id/
 */
export async function setUserAdmin(userId: number, isAdmin: boolean): Promise<AdminUser> {
    return http<AdminUser>(`/users/${userId}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_admin: isAdmin }),
    });
}

/**
 * Delete (deactivate) a user account — the same endpoint the profile page's
 * "Delete account" button hits, but targeting an arbitrary user id.
 * Route: DELETE /users/:user_id/
 */
export async function deleteUser(userId: number): Promise<void> {
    return http<void>(`/users/${userId}/`, {
        method: "DELETE",
    });
}

/**
 * Fetch a single user by id. The backend has no GET /users/:id, so we go through
 * the admin search endpoint with an exact user_id filter. Used by the settings
 * page when an admin edits someone else's account.
 */
export async function getUserById(userId: number): Promise<AdminUser | null> {
    const response = await searchUsers({
        page: 1,
        limit: 1,
        filters: [{ field: "user_id", operator: "=", value: userId }],
    });
    return response.users?.[0] ?? null;
}
