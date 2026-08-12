"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Role = "admin" | "user";

type AuthState = {
    username: string | null;
    role: Role | null;
    isAdmin: boolean;
    isAuthenticated: boolean;
    isReady: boolean;
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
    // Server output and the client's first render must match. Restore browser-only
    // auth state after hydration, then let protected pages render.
    const [username, setUsername] = useState<string | null>(null);
    const [role, setRole] = useState<Role | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => {
            setUsername(readStoredUsername());
            setRole(readStoredRole());
            setIsReady(true);
        }, 0);
        return () => window.clearTimeout(id);
    }, []);

    const signIn = useCallback((newUsername: string, newRole: Role) => {
        localStorage.setItem("username", newUsername);
        localStorage.setItem("role", newRole);
        setUsername(newUsername);
        setRole(newRole);
        setIsReady(true);
    }, []);

    const signOut = useCallback(() => {
        localStorage.removeItem("username");
        localStorage.removeItem("role");
        setUsername(null);
        setRole(null);
        setIsReady(true);
    }, []);

    return (
        <AuthContext.Provider
            value={{ username, role, isAdmin: role === "admin", isAuthenticated: !!username, isReady, signIn, signOut }}
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
