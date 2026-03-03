
import React from "react";
import { useRouter, usePathname } from "next/navigation";
interface HeaderProps {
    currentScreen: string;
    setCurrentScreen: React.Dispatch<React.SetStateAction<string>>;
}
export default function Header({ currentScreen, setCurrentScreen }: HeaderProps) {
    const router = useRouter();
    return (
        <div className="header  border-b-2 border-black flex flex-row justify-start items-center p-3">
            <img src="/MOA_logo.svg" alt="MOA logo" width={200} height={50} />
            <div className="flex flex-row w-full justify-evenly items-center">
                <div className={`${currentScreen === "MIDNIGHT AI" ? "nav-active" : "nav-inactive"}`}
                onClick={() => setCurrentScreen("MIDNIGHT AI")}>MIDNIGHT AI</div>
                <div 
                className={`${currentScreen === "DATA COLLECTOR" ? "nav-active" : "nav-inactive"}`}
                onClick={() => setCurrentScreen("DATA COLLECTOR")}>DATA COLLECTOR</div>
            </div>
        </div>
    );
}   