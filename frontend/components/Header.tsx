"use client";
import { useRouter, usePathname } from "next/navigation";
import UserDisplay from "./UserDisplay";
import { useAuth } from "@/contexts/AuthContext";

const IconQuote = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
);

const IconDatabase = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
);

const IconUsers = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
);

const IconAI = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1a7 7 0 0 1-7 7H9a7 7 0 0 1-7-7H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
        <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/>
    </svg>
);

export default function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const { isAdmin } = useAuth();

    return (
        <div className="header border-b-2 border-[#E0E0E0] flex flex-row items-center gap-6 px-5 py-3 bg-white">
            <img src="/MOA_logo.svg" alt="MOA logo" width={200} height={50} className="shrink-0" />
            <div className="flex flex-row flex-1 justify-evenly items-center gap-4 min-w-0 tracking-wider">
                <div
                    className={`${pathname === "/quoteEngine" ? "nav-active" : "nav-inactive"} whitespace-nowrap font-[20px] flex items-center gap-1.5 cursor-pointer`}
                    onClick={() => router.push("/quoteEngine")}
                >
                    <IconQuote />QUOTE ENGINE
                </div>
                <div
                    className={`${pathname === "/midnightAI" ? "nav-active" : "nav-inactive"} whitespace-nowrap flex items-center gap-1.5 cursor-pointer`}
                    onClick={() => router.push("/midnightAI")}
                >
                    {/* <IconAI />MIDNIGHT AI */}
                    MIDNIGHT AI
                </div>
                {isAdmin && (
                    <div
                        className={`${pathname === "/dataCollector" ? "nav-active" : "nav-inactive"} whitespace-nowrap flex items-center gap-1.5 cursor-pointer`}
                        onClick={() => router.push("/dataCollector")}
                    >
                        <IconDatabase />DATA COLLECTOR
                    </div>
                )}
                {isAdmin && (
                    <div
                        className={`${pathname === "/userManagement" ? "nav-active" : "nav-inactive"} whitespace-nowrap flex items-center gap-1.5 cursor-pointer`}
                        onClick={() => router.push("/userManagement")}
                    >
                        <IconUsers />USER MANAGEMENT
                    </div>
                )}
            </div>
            <UserDisplay />
        </div>
    );
}
