"use client";

import { useEffect, useRef, useState } from "react";

export default function UserDisplay() {
    const [isOpen, setIsOpen] = useState(false);
    const [username, setUsername] = useState("Guest");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem("username");
        if (stored) setUsername(stored.toUpperCase());
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSignOut = () => {
        localStorage.removeItem("username");
        setIsOpen(false);
        window.location.reload();
    };

    return (
        <div ref={containerRef} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex items-center gap-2 cursor-pointer group"
            >
                {/* <div className="w-8 h-8 rounded-full bg-[#FFC843] flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-[#000005] tracking-wide leading-none">
                        {username.slice(0, 2)}
                    </span>
                </div> */}
                <div className="flex items-center gap-1">
                    <span className="text-[12px] font-bold text-[#000005] tracking-wide uppercase">{username}</span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[#B1B3B6] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    >
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
            </button>

            <div className={`absolute top-full right-0 mt-2 bg-white border border-[#E8E8E8] rounded-md shadow-lg w-44 z-20 overflow-hidden ${isOpen ? "sign-out-visible" : "sign-out-hidden"}`}>
                <div className="px-3 py-2.5 border-b border-[#F0F0F0]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#B1B3B6]">Signed in as</p>
                    <p className="text-[12px] font-bold text-[#000005] mt-0.5 truncate">{username}</p>
                </div>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold text-[#B1B3B6] hover:text-red-500 hover:bg-red-50 transition-colors duration-150 tracking-wider uppercase"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign out
                </button>
            </div>
        </div>
    );
}
