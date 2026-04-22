"use client";
import ElementsManager from "@/components/ElementsManager";
import Dropdown from "@/components/Dropdown";
import QuoteBreakdown from "@/components/QuoteBreakdown";
import { useState } from "react";

type StandeeType = "Simple" | "Moderate" | "Complex";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
};

export default function Inputter() {
    const [standeeCount, setStandeeCount] = useState<number | "">("");
    const [standeeType, setStandeeType]   = useState<StandeeType>("Simple");
    const [elements, setElements]         = useState<Element[]>([]);
    const [resetKey, setResetKey]         = useState(0);
    const [isLoading, setIsLoading]       = useState(false);
    const [quoteData, setQuoteData]       = useState<{
        scenario_1: {
            total_cost: number;
            total_universal_cost: number;
            corrugate_cost: number;
            imposition_cost: number;
            blank_comp_cost: number;
            color_comp_cost: number;
            engineering_design_cost: number;
            hardware_cost: number;
            print_form_cost: number;
            zund_cut_cost: number;
            shipping_box_cost: number;
            label_cost: number;
            instruction_sheet_cost: number;
        };
    } | null>(null);

    function handleClear() {
        setStandeeCount("");
        setStandeeType("Simple");
        setElements([]);
        setResetKey((k) => k + 1);
    }

    function handleQuoteGeneration() {
        const standeeTypeMap: Record<StandeeType, number> = { Simple: 1, Moderate: 2, Complex: 3 };
        const payload = {
            standee_type: standeeTypeMap[standeeType],
            elements: elements.map(({ height, width, complexity, linear_inches }) => ({
                height: height === "" ? 0 : height,
                width: width === "" ? 0 : width,
                complexity,
                linear_inches: linear_inches === "" ? null : linear_inches,
            })),
            num_standees: standeeCount === "" ? 0 : standeeCount,
        };

        setIsLoading(true);
        fetch("http://localhost:8000/generate_quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
            .then((res) => res.json())
            .then((data) => { console.log(data); setQuoteData(data); })
            .catch((error) => console.error("Error generating quote:", error))
            .finally(() => setIsLoading(false));
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center w-full flex-1">
                <div className="text-[3em] font-instrument mb-8">
                    <span className="italic text-[#FFB604]">Calculating</span> Quote
                </div>
                <div className="flex gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#FFB604] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFB604] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFB604] animate-bounce" />
                </div>
            </div>
        );
    }

    if (quoteData) {
        return <QuoteBreakdown quoteData={quoteData} numStandees={standeeCount === "" ? 0 : standeeCount} onBack={() => setQuoteData(null)} />;
    }

    return (
        <div className="flex flex-col items-center w-full flex-1 overflow-hidden px-10 py-6">
            {/* Title */}
            <div className="w-full max-w-2xl mb-4 shrink-0">
                <div className="text-[3em] font-instrument">
                    <span className="italic text-[#FFB604]">Quote</span> Estimate
                </div>
                <p className="text-xs text-[#ABABAB]">Configure parameters to generate a cost estimate</p>
            </div>

            {/* Form card */}
            <div className="flex flex-col w-full max-w-2xl flex-1 min-h-0 border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB] overflow-hidden">

                {/* 01 - COUNTS */}
                <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA] shrink-0">
                    <div className="text-[10px] mb-3">01 - COUNTS</div>
                    <div className="flex flex-row gap-8 w-full">
                        <div>
                            <div className="text-xs font-bold m-2">Standee Type</div>
                            <Dropdown
                                key={resetKey}
                                options={["Simple", "Moderate", "Complex"]}
                                currOption={standeeType}
                                onSelect={(val: StandeeType) => setStandeeType(val)}
                            />
                        </div>
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
                    </div>
                </div>

                {/* 02 - ELEMENTS */}
                <div className="flex flex-col flex-1 min-h-0 items-start w-full p-4 border-b-2 border-[#EDEAEA] overflow-hidden">
                    <div className="text-[10px] mb-3">
                        02 - ELEMENTS
                        <span className="ml-2 text-[#FFB604]">({elements.length} added)</span>
                    </div>
                    <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                        <ElementsManager key={resetKey} elements={elements} setElements={setElements} />
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
                    <div
                        onClick={handleQuoteGeneration}
                        className="group flex flex-row justify-center gap-5 text-s font-bold bg-[#FFB604] text-black hover:text-white py-3 rounded-md flex-[2] cursor-pointer transition-all duration-250 ease-in-out overflow-hidden"
                    >
                        CALCULATE <img src="/submitarrow.svg" alt="" className="transition-all duration-300 ease-in-out group-hover:translate-x-1 group-hover:invert" />
                    </div>
                </div>
            </div>
        </div>
    );
}
