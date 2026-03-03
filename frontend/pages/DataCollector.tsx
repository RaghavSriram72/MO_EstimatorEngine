"use client";
import Header from "@/components/Header";
import { useState } from "react";
export default function DataCollector() {
    const [currentModule, setCurrentModule] = useState(0);

    return (
            <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">
                <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                    <div className="text-[1.2em] font-bold">DB Modules</div>
                    <ul className="flex flex-col gap-1 w-full">
                        <li 
                        className={`${currentModule == 0 ? "tab-active " : "tab-inactive"} flex items-center gap-2 w-full `}
                        onClick={() => setCurrentModule(0)}>
                            <span>•</span> Flute Pricing
                        </li>
                        <li 
                        className={`${currentModule == 1 ? "tab-active" : "tab-inactive"} flex items-center gap-2 w-full`} 
                        onClick={() => setCurrentModule(1)}>
                        <span>•</span> Packaging Co
                        </li>
                    </ul>
                </div>



                <div className="flex flex-col ml-5 p-1 justify-start items-start  ">
                    <div className="ml-15 pb-3">
                        <div className="text-[2.5em]  font-instrument">Update <span className="italic text-[#FFB604]">Flute</span> Pricing</div>
                        <p className="text-xs">Modify Live Data for Flute Pricing Module</p>
                    </div>
                   

                    <div className="w-[50vw] h-[70vh] border-2 border-[#EDEAEA] rounded-md p-5 text-[#ABABAB]">
                        {/* SECTION 1 */}
                        <div className="flex flex-col justify-center items-start border-b-2 border-[#EDEAEA] w-full">
                            <div className="text-[10px] m-2">01 - RECORD SELECTION</div>
                            <div>
                                <div className="text-xs font-bold m-2">Flute Type</div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
    );
}