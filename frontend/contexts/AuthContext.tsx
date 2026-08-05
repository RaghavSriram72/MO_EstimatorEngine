"use client";
import { createContext, useCallback, useContext, useState } from "react";

export type Role = "admin" | "user";

type AuthState = {
    username: string | null;
    role: Role | null;
    isAdmin: boolean;
    isAuthenticated: boolean;
    signIn: (username: string, role: Role) => void;
    signOut: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function readStoredUsername(): string | null {
    return typeof window === "undefined" ? null : localStorage.getItem("username");
}

function readStoredRole(): Role | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("role");
    return stored === "admin" || stored === "user" ? stored : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    // Lazy initializers run synchronously on the client's first render, so there's
    // no post-mount flash where a signed-in user briefly reads as signed-out.
    const [username, setUsername] = useState<string | null>(readStoredUsername);
    const [role, setRole] = useState<Role | null>(readStoredRole);

    const signIn = useCallback((newUsername: string, newRole: Role) => {
        localStorage.setItem("username", newUsername);
        localStorage.setItem("role", newRole);
        setUsername(newUsername);
        setRole(newRole);
    }, []);

    const signOut = useCallback(() => {
        localStorage.removeItem("username");
        localStorage.removeItem("role");
        setUsername(null);
        setRole(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{ username, role, isAdmin: role === "admin", isAuthenticated: !!username, signIn, signOut }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
}
