
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import UserDisplay from "./UserDisplay";
interface HeaderProps {
    currentScreen: string;
    setCurrentScreen: React.Dispatch<React.SetStateAction<string>>;
}
export default function Header({ currentScreen, setCurrentScreen }: HeaderProps) {
    const router = useRouter();
    return (
        <div className="header border-b-2 border-[#EDEAEA] flex flex-row items-center gap-6 px-5 py-3">
            <img src="/MOA_logo.svg" alt="MOA logo" width={200} height={50} className="shrink-0" />
            <div className="flex flex-row flex-1 justify-evenly items-center gap-4 min-w-0 tracking-wider">
                <div className={`${currentScreen === "MIDNIGHT AI" ? "nav-active" : "nav-inactive"} whitespace-nowrap`}
                onClick={() => setCurrentScreen("MIDNIGHT AI")}>MIDNIGHT AI</div>
                <div 
                className={`${currentScreen === "DATA COLLECTOR" ? "nav-active" : "nav-inactive"} whitespace-nowrap`}
                onClick={() => setCurrentScreen("DATA COLLECTOR")}>DATA COLLECTOR</div>
                
            </div>
            <UserDisplay />
            
        </div>
    );
}   