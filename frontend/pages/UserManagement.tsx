"use client";
import { Fragment, useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { useAuth } from "@/contexts/AuthContext";

type Role = "admin" | "user";

type UserRow = {
    username: string;
    role: Role;
    created_at?: string;
};

function apiErrorMessage(data: unknown): string | null {
    if (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string") {
        return (data as { error: string }).error;
    }
    return null;
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms ease" }}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

export default function UserManagement() {
    const { username: requester } = useAuth();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingUsername, setUpdatingUsername] = useState<string | null>(null);
    const [resettingUsername, setResettingUsername] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetError, setResetError] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [search, setSearch] = useState("");

    async function loadUsers() {
        if (!requester) return;
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/users?requester=${encodeURIComponent(requester)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(apiErrorMessage(data) ?? "Could not load users"); return; }
            setUsers(Array.isArray(data.data) ? data.data : []);
        } catch {
            setError("Could not load users");
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        void loadUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requester]);

    async function changeRole(username: string, role: Role) {
        if (!requester) return;
        setUpdatingUsername(username);
        setError(null);
        try {
            const res = await fetch(
                `${API_BASE}/users/${encodeURIComponent(username)}/role?requester=${encodeURIComponent(requester)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ role }),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(apiErrorMessage(data) ?? "Could not update role"); return; }
            setUsers((prev) => prev.map((u) => (u.username === username ? { ...u, role } : u)));
        } catch {
            setError("Could not update role");
        } finally {
            setUpdatingUsername(null);
        }
    }

    function openReset(username: string) {
        setResettingUsername(username);
        setNewPassword("");
        setConfirmPassword("");
        setResetError(null);
    }

    function closeReset() {
        setResettingUsername(null);
        setNewPassword("");
        setConfirmPassword("");
        setResetError(null);
    }

    const filteredUsers = users.filter((u) =>
        u.username.toLowerCase().includes(search.trim().toLowerCase())
    );

    async function submitReset(username: string) {
        if (!requester) return;
        if (!newPassword || newPassword !== confirmPassword) {
            setResetError(!newPassword ? "Enter a new password" : "Passwords do not match");
            return;
        }
        setIsResetting(true);
        setResetError(null);
        try {
            const res = await fetch(
                `${API_BASE}/users/${encodeURIComponent(username)}/password?requester=${encodeURIComponent(requester)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: newPassword }),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setResetError(apiErrorMessage(data) ?? "Could not reset password"); return; }
            closeReset();
        } catch {
            setResetError("Could not reset password");
        } finally {
            setIsResetting(false);
        }
    }

    return (
        <div className="flex flex-col items-center w-full flex-1 min-h-0 overflow-y-auto bg-white px-8 py-8">
          <div className="flex flex-col w-full max-w-4xl">
            <div className="flex flex-col gap-0.5 mb-6">
                <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#B1B3B6]">Admin</span>
                <span className="text-[1.5em] font-bold text-[#000005]">User Management</span>
                <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">
                    Promote or demote accounts. Admins can access the Data Collector and edit or delete any project.
                </p>
            </div>

            {error && (
                <div className="mb-4 text-[12px] text-red-500 font-semibold">{error}</div>
            )}

            <div className="mb-4">
                <input
                    id="user-management-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by username…"
                    autoComplete="off"
                    className="w-full text-[11px] font-semibold text-[#000005] placeholder:text-[#B1B3B6] border-2 border-[#E0E0E0] rounded-sm px-3 py-2.5 outline-none focus-visible:border-[#FFC843] focus-visible:ring-2 focus-visible:ring-[#FFC843] transition-colors"
                />
            </div>

            {isLoading ? (
                <div className="text-[12px] text-[#B1B3B6] font-semibold">Loading…</div>
            ) : (
                <div className="border-2 border-[#E0E0E0] rounded-md overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-[#F8F8F8] border-b-2 border-[#FFC843]">
                            <tr>
                                <th className="text-[10px] font-black uppercase tracking-widest text-[#B1B3B6] px-4 py-3">Username</th>
                                <th className="text-[10px] font-black uppercase tracking-widest text-[#B1B3B6] px-4 py-3">Role</th>
                                <th className="text-[10px] font-black uppercase tracking-widest text-[#B1B3B6] px-4 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-6 text-center text-[12px] text-[#B1B3B6] font-semibold">
                                        {search.trim() ? <>No users match &ldquo;{search.trim()}&rdquo;</> : "No users found"}
                                    </td>
                                </tr>
                            )}
                            {filteredUsers.map((u) => {
                                const isSelf = u.username === requester;
                                const isUpdating = updatingUsername === u.username;
                                const isResettingThisRow = resettingUsername === u.username;
                                return (
                                    <Fragment key={u.username}>
                                    <tr className="border-t border-[#F0F0F0] transition-colors duration-150 hover:bg-[#FFFBEE]">
                                        <td className="px-4 py-3 text-[13px] font-bold text-[#000005]">
                                            {u.username}{isSelf && <span className="ml-1.5 text-[9px] font-black uppercase text-[#B1B3B6]">(you)</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${
                                                u.role === "admin" ? "bg-[#FFC843]/20 text-[#8a6d1f]" : "bg-[#F0F0F0] text-[#64748B]"
                                            }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    disabled={isUpdating}
                                                    onClick={() => changeRole(u.username, u.role === "admin" ? "user" : "admin")}
                                                    className="cursor-pointer text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-sm border-2 border-[#000005] text-[#000005] hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {isUpdating ? "Updating…" : u.role === "admin" ? "Make User" : "Make Admin"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => (isResettingThisRow ? closeReset() : openReset(u.username))}
                                                    aria-expanded={isResettingThisRow}
                                                    aria-label="Reset password"
                                                    title="Reset password"
                                                    className="cursor-pointer flex items-center justify-center w-7 h-7 rounded-sm border border-[#E0E0E0] text-[#B1B3B6] hover:border-[#000005] hover:text-[#000005] transition-colors duration-200"
                                                >
                                                    <ChevronIcon open={isResettingThisRow} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan={3} className="p-0">
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateRows: isResettingThisRow ? "1fr" : "0fr",
                                                    transition: "grid-template-rows 220ms ease",
                                                }}
                                            >
                                                <div className="overflow-hidden">
                                                    <form
                                                        onSubmit={(e) => { e.preventDefault(); void submitReset(u.username); }}
                                                        className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#FFFBEE] border-t border-[#F0F0F0]"
                                                    >
                                                        <input
                                                            type="password"
                                                            value={newPassword}
                                                            onChange={(e) => setNewPassword(e.target.value)}
                                                            placeholder="New password"
                                                            tabIndex={isResettingThisRow ? 0 : -1}
                                                            className="border-2 border-[#E0E0E0] rounded-sm py-1.5 px-2 bg-white focus:outline-none focus:border-[#FFC843] text-[#000005] font-semibold text-xs"
                                                        />
                                                        <input
                                                            type="password"
                                                            value={confirmPassword}
                                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                                            placeholder="Confirm password"
                                                            tabIndex={isResettingThisRow ? 0 : -1}
                                                            className="border-2 border-[#E0E0E0] rounded-sm py-1.5 px-2 bg-white focus:outline-none focus:border-[#FFC843] text-[#000005] font-semibold text-xs"
                                                        />
                                                        <button
                                                            type="submit"
                                                            disabled={isResetting}
                                                            tabIndex={isResettingThisRow ? 0 : -1}
                                                            className="cursor-pointer text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-sm bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {isResetting ? "Saving…" : "Save"}
                                                        </button>
                                                        {resetError && (
                                                            <span className="text-[11px] text-red-500 font-semibold">{resetError}</span>
                                                        )}
                                                    </form>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
          </div>
        </div>
    );
}
