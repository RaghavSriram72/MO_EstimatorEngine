"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Inputter from "@/pages/Inputter";
import { useAuth } from "@/contexts/AuthContext";

export default function QuoteEnginePage() {
    const router = useRouter();
    const { isAuthenticated, isReady } = useAuth();
    useEffect(() => {
        if (isReady && !isAuthenticated) router.replace("/sign-in");
    }, [isAuthenticated, isReady, router]);

    if (!isReady || !isAuthenticated) return null;

    return (
        <div className="flex flex-col h-screen w-full bg-white" style={{ fontFamily: "'Proxima Nova', sans-serif" }}>
            <Header />
            <Inputter />
        </div>
    );
}
