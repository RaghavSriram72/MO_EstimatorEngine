"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import MidnightAI from "@/pages/MidnightAI";
import { useAuth } from "@/contexts/AuthContext";

export default function MidnightAIPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    useEffect(() => {
        if (!isAuthenticated) router.replace("/sign-in");
    }, [isAuthenticated, router]);

    return (
        <div className="flex flex-col h-screen w-full bg-white" style={{ fontFamily: "'Proxima Nova', sans-serif" }}>
            <Header />
            <MidnightAI />
        </div>
    );
}
