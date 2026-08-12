"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import DataCollector from "@/pages/DataCollector";
import { useAuth } from "@/contexts/AuthContext";

export default function DataCollectorPage() {
    const router = useRouter();
    const { isAuthenticated, isAdmin, isReady } = useAuth();
    useEffect(() => {
        if (!isReady) return;
        if (!isAuthenticated) { router.replace("/sign-in"); return; }
        if (!isAdmin) router.replace("/quoteEngine");
    }, [isAuthenticated, isAdmin, isReady, router]);

    if (!isReady || !isAuthenticated || !isAdmin) return null;

    return (
        <div className="flex flex-col h-screen w-full bg-white" style={{ fontFamily: "'Proxima Nova', sans-serif" }}>
            <Header />
            <DataCollector />
        </div>
    );
}
