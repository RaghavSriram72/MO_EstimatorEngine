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
                className="text-[#777474] font-bold cursor-pointer border-2 border-[#FEC844] px-4 py-1 rounded-[30px] whitespace-nowrap"
            >
                USER: {username}
            </div>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white border-2 border-[#EDEAEA] rounded-md shadow-sm w-full z-20">
                    <div
                        onClick={handleSignOut}
                        className="w-full cursor-pointer text-left px-3 py-2 text-sm text-[#777474] hover:text-black hover:bg-[#FFFBED] rounded-md transition-all duration-200 ease-in-out"
                    >
                        Sign out
                    </div>
                </div>
            )}
        </div>
    );
}