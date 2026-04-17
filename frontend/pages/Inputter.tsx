"use client";
import ElementsManager from "@/components/ElementsManager";
import { useState } from "react";

type Scenario = "In House" | "Partial" | "Outsource";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
};

export default function Inputter() {
    const [currentScenario, setCurrentScenario] = useState<Scenario>("In House");
    const [compCount, setCompCount] = useState<number | "">("");
    const [elements, setElements] = useState<Element[]>([]);

    const scenarios: Scenario[] = ["In House", "Partial", "Outsource"];

    function handleClear() {
        setCompCount("");
        setElements([]);
    }

    return (
        <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                <div className="text-[1.2em] font-bold">Scenarios</div>
                <ul className="flex flex-col gap-4 w-full">
                    {scenarios.map((s) => (
                        <li
                            key={s}
                            className={`${currentScenario === s ? "tab-active" : "tab-inactive"} flex items-center gap-5 w-full`}
                            onClick={() => setCurrentScenario(s)}
                        >
                            <span>•</span> {s}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Main Form */}
            <div className="flex flex-col ml-5 p-1 overflow-hidden">
                {/* Animated title */}
                <div className="relative ml-15 pb-2 h-[90px] shrink-0 overflow-hidden">
                    {scenarios.map((s) => (
                        <div
                            key={s}
                            className={`absolute inset-0 ${currentScenario === s ? "data-collector-title-active" : "data-collector-title-inactive"}`}
                        >
                            <div className="text-[3em] font-instrument">
                                <span className="italic text-[#FFB604]">{s}</span> Estimate
                            </div>
                            <p className="text-xs">Configure parameters for {s.toLowerCase()} production scenario</p>
                        </div>
                    ))}
                </div>

                {/* Form card — fills remaining height */}
                <div className="flex flex-col w-[50vw] flex-1 min-h-0 border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB] overflow-hidden">

                    {/* 01 - ELEMENTS — expands to fill space */}
                    <div className="flex flex-col flex-1 min-h-0 items-start w-full p-4 border-b-2 border-[#EDEAEA] overflow-hidden">
                        <div className="text-[10px] mb-3">
                            01 - ELEMENTS
                            <span className="ml-2 text-[#FFB604]">({elements.length} added)</span>
                        </div>
                        <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                            <ElementsManager elements={elements} setElements={setElements} />
                        </div>
                    </div>

                    {/* 02 - COMP COUNT */}
                    <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA] shrink-0">
                        <div className="text-[10px] m-2">02 - COMPONENT COUNTS</div>
                        <div>
                            <div className="text-xs font-bold m-2">Comp Count</div>
                            <input
                                type="number"
                                min={0}
                                value={compCount}
                                onChange={(e) =>
                                    setCompCount(e.target.value === "" ? "" : Number(e.target.value))
                                }
                                placeholder="0"
                                className="border-2 border-[#EDEAEA] rounded-md p-1 outline-none text-black text-xs w-[200px] bg-[#FFFBED]"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex w-full flex-row items-center px-4 py-3 gap-4 shrink-0">
                        <div
                            onClick={handleClear}
                            className="text-s text-center font-bold text-[#ABABAB] border-2 border-[#EDEAEA] py-3 rounded-md flex-1 cursor-pointer hover:bg-[#EDEAEA] transition-all duration-250"
                        >
                            CLEAR
                        </div>
                        <div className="group flex flex-row justify-center gap-5 text-s font-bold bg-[#FFB604] text-black hover:text-white py-3 rounded-md flex-[2] cursor-pointer transition-all duration-250 ease-in-out overflow-hidden">
                            CALCULATE <img src="/submitarrow.svg" alt="" className="transition-all duration-300 ease-in-out group-hover:translate-x-1 group-hover:invert" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
