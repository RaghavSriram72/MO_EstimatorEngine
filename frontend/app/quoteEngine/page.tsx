"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Inputter from "@/pages/Inputter";

export default function QuoteEnginePage() {
    const router = useRouter();
    useEffect(() => {
        if (!localStorage.getItem("username")) router.replace("/sign-in");
    }, [router]);

    return (
        <div className="flex flex-col h-screen w-full bg-white" style={{ fontFamily: "'Proxima Nova', sans-serif" }}>
            <Header />
            <Inputter />
        </div>
    );
}
