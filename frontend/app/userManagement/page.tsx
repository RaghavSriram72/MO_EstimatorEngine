"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import UserManagement from "@/pages/UserManagement";
import { useAuth } from "@/contexts/AuthContext";

export default function UserManagementPage() {
    const router = useRouter();
    const { isAuthenticated, isAdmin } = useAuth();
    useEffect(() => {
        if (!isAuthenticated) { router.replace("/sign-in"); return; }
        if (!isAdmin) router.replace("/quoteEngine");
    }, [isAuthenticated, isAdmin, router]);

    if (!isAuthenticated || !isAdmin) return null;

    return (
        <div className="flex flex-col h-screen w-full bg-white" style={{ fontFamily: "'Proxima Nova', sans-serif" }}>
            <Header />
            <UserManagement />
        </div>
    );
}
