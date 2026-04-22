"use client";
import ElementsManager from "@/components/ElementsManager";
import { useState } from "react";

type Scenario = "Internal" | "Hybrid" | "External";
type Assembly = "packed_out" | "assembled";
type Finishing = "internal" | "external_die_cut";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
};

function getScenarioNumber(scenario: Scenario, assembly: Assembly, finishing: Finishing): number {
    if (scenario === "Internal") return assembly === "packed_out" ? 1 : 2;
    if (scenario === "Hybrid")   return finishing === "internal" ? 3 : 4;
    return 5;
}

export default function Inputter() {
    const [currentScenario, setCurrentScenario] = useState<Scenario>("Internal");
    const [assembly, setAssembly]   = useState<Assembly>("packed_out");
    const [finishing, setFinishing] = useState<Finishing>("internal");
    const [compCount, setCompCount]       = useState<number | "">("");
    const [standeeCount, setStandeeCount] = useState<number | "">("");
    const [elements, setElements]   = useState<Element[]>([]);

    const scenarios: Scenario[] = ["Internal", "Hybrid", "External"];

    const scenarioNumber = getScenarioNumber(currentScenario, assembly, finishing);

    function handleClear() {
        setCompCount("");
        setStandeeCount("");
        setElements([]);
        setAssembly("packed_out");
        setFinishing("internal");
    }

    function handleQuoteGeneration() {
        const payload: Record<string, unknown> = {
            scenario: scenarioNumber,
            elements: elements.map(({ height, width, complexity, linear_inches }) => ({
                name: "",
                height: height === "" ? 0 : height,
                width: width === "" ? 0 : width,
                complexity,
                linear_inches: linear_inches === "" ? null : linear_inches,
            })),
            num_standees: standeeCount === "" ? 0 : standeeCount,
        };
        if (typeof window !== "undefined") {
            const owner = localStorage.getItem("username");
            if (owner) payload.owner = owner;
        }

        fetch("http://localhost:8000/generate_quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
            .then((res) => res.json())
            .then((data) => console.log("Quote generation response:", data))
            .catch((error) => console.error("Error generating quote:", error));
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

                {/* Scenario badge */}
                <div className="mt-4 w-full">
                    <div className="text-[10px] text-[#ABABAB] mb-1">RESOLVED SCENARIO</div>
                    <div className="text-xs font-bold border-2 border-[#FFB604] bg-[#FFF3C2] text-[#9A6D00] rounded-md px-3 py-2">
                        Scenario {scenarioNumber}
                    </div>
                </div>
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

                {/* Form card */}
                <div className="flex flex-col w-[50vw] flex-1 min-h-0 border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB] overflow-hidden">

                    {/* 01 - ELEMENTS */}
                    <div className="flex flex-col flex-1 min-h-0 items-start w-full p-4 border-b-2 border-[#EDEAEA] overflow-hidden">
                        <div className="text-[10px] mb-3">
                            01 - ELEMENTS
                            <span className="ml-2 text-[#FFB604]">({elements.length} added)</span>
                        </div>
                        <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                            <ElementsManager elements={elements} setElements={setElements} />
                        </div>
                    </div>

                    {/* 02 - COUNTS */}
                    <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA] shrink-0">
                        <div className="text-[10px] m-2">02 - COUNTS</div>
                        <div className="flex flex-row gap-8">
                            <div>
                                <div className="text-xs font-bold m-2">Standee Count</div>
                                <input
                                    type="number"
                                    min={0}
                                    value={standeeCount}
                                    onChange={(e) =>
                                        setStandeeCount(e.target.value === "" ? "" : Number(e.target.value))
                                    }
                                    placeholder="0"
                                    className="border-2 border-[#EDEAEA] rounded-md p-1 outline-none text-black text-xs w-[200px] bg-[#FFFBED]"
                                />
                            </div>
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
                    </div>

                    {/* 03 - SCENARIO DETAILS */}
                    <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA] shrink-0">
                        <div className="text-[10px] m-2">03 - SCENARIO DETAILS</div>

                        {currentScenario === "Internal" && (
                            <div className="w-full">
                                <div className="text-xs font-bold m-2">Assembly / Packout</div>
                                <div className="flex flex-row gap-3 w-full">
                                    {([
                                        { value: "packed_out", label: "Packed Out (Box)" },
                                        { value: "assembled",  label: "Assembled" },
                                    ] as { value: Assembly; label: string }[]).map(({ value, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => setAssembly(value)}
                                            className={`text-xs flex-1 py-3 rounded-md border-2 cursor-pointer font-bold transition-all duration-250 ${
                                                assembly === value
                                                    ? "bg-black text-white border-black"
                                                    : "bg-white text-[#363535] border-[#EDEAEA] hover:bg-[#DBDBDB] hover:border-[#a1a1a1]"
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {currentScenario === "Hybrid" && (
                            <div className="w-full">
                                <div className="text-xs font-bold m-2">Finishing</div>
                                <div className="flex flex-row gap-3 w-full">
                                    {([
                                        { value: "internal",          label: "Internal" },
                                        { value: "external_die_cut",  label: "External Die Cut" },
                                    ] as { value: Finishing; label: string }[]).map(({ value, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => setFinishing(value)}
                                            className={`text-xs flex-1 py-3 rounded-md border-2 cursor-pointer font-bold transition-all duration-250 ${
                                                finishing === value
                                                    ? "bg-black text-white border-black"
                                                    : "bg-white text-[#363535] border-[#EDEAEA] hover:bg-[#DBDBDB] hover:border-[#a1a1a1]"
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {currentScenario === "External" && (
                            <div className="text-xs italic text-[#CDCDCD] m-2">
                                Fully external — no sub-options required.
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex w-full flex-row items-center px-4 py-3 gap-4 shrink-0">
                        <div
                            onClick={handleClear}
                            className="text-s text-center font-bold text-[#ABABAB] border-2 border-[#EDEAEA] py-3 rounded-md flex-1 cursor-pointer hover:bg-[#EDEAEA] transition-all duration-250"
                        >
                            CLEAR
                        </div>
                        <div
                            onClick={handleQuoteGeneration}
                            className="group flex flex-row justify-center gap-5 text-s font-bold bg-[#FFB604] text-black hover:text-white py-3 rounded-md flex-[2] cursor-pointer transition-all duration-250 ease-in-out overflow-hidden"
                        >
                            CALCULATE <img src="/submitarrow.svg" alt="" className="transition-all duration-300 ease-in-out group-hover:translate-x-1 group-hover:invert" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
