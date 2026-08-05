"use client";
import { useEffect, useState } from "react";
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

export default function UserManagement() {
    const { username: requester } = useAuth();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingUsername, setUpdatingUsername] = useState<string | null>(null);

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
                            {users.map((u) => {
                                const isSelf = u.username === requester;
                                const isUpdating = updatingUsername === u.username;
                                return (
                                    <tr key={u.username} className="border-t border-[#F0F0F0] transition-colors duration-150 hover:bg-[#FFFBEE]">
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
                                            <button
                                                type="button"
                                                disabled={isUpdating}
                                                onClick={() => changeRole(u.username, u.role === "admin" ? "user" : "admin")}
                                                className="cursor-pointer text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-sm border-2 border-[#000005] text-[#000005] hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {isUpdating ? "Updating…" : u.role === "admin" ? "Make User" : "Make Admin"}
                                            </button>
                                        </td>
                                    </tr>
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
