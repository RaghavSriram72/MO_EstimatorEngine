"use client";

import { useEffect, useRef, useState } from "react";

export default function UserDisplay() {
    const [isOpen, setIsOpen] = useState(false);
    const [username, setUsername] = useState("GUEST");
    const containerRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const storedUsername = localStorage.getItem("username");
        if (storedUsername) {
            setUsername(storedUsername.toUpperCase());
        }
    }, []);


    const handleSignOut = () => {
        localStorage.removeItem("username");
        setIsOpen(false);
        window.location.reload();
    };

    return (
        <div ref={containerRef} className="relative shrink-0">
            <div
                onClick={() => setIsOpen((previous) => !previous)}
                className="text-[#000005] font-bold text-sm cursor-pointer border-2 border-[#FFC843] px-4 py-1.5 rounded-sm whitespace-nowrap tracking-widest uppercase"
            >
                USER: {username}
            </div>

            <div className={`absolute top-full right-0 mt-2 bg-white border border-[#E0E0E0] rounded-sm shadow-md w-full z-20 ${isOpen ? "sign-out-visible" : "sign-out-hidden"}`}>
                <div
                    onClick={handleSignOut}
                    className="w-full cursor-pointer text-left px-3 py-2 text-xs font-bold text-[#B1B3B6] hover:text-[#000005] hover:bg-[#F4F4F4] rounded-sm transition-all duration-200 ease-in-out tracking-wider uppercase"
                >
                    Sign out
                </div>
            </div>

        </div>
    );
}
