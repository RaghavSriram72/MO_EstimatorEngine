"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import DataCollector from "@/pages/DataCollector";

export default function DataCollectorPage() {
    const router = useRouter();
    useEffect(() => {
        if (!localStorage.getItem("username")) router.replace("/sign-in");
    }, [router]);

    return (
        <div className="flex flex-col h-screen w-full bg-white" style={{ fontFamily: "'Proxima Nova', sans-serif" }}>
            <Header />
            <DataCollector />
        </div>
    );
}
