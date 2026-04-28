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

export type QuoteData = Record<string, Record<string, number>>;

export default function Inputter() {
    const [standeeCount, setStandeeCount] = useState<number | "">("");
    const [standeeType, setStandeeType]   = useState<StandeeType>("Simple");
    const [elements, setElements]         = useState<Element[]>([]);
    const [resetKey, setResetKey]         = useState(0);
    const [isLoading, setIsLoading]       = useState(false);
    const [quoteData, setQuoteData]       = useState<QuoteData | null>(null);

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
            <div className="flex flex-col items-center justify-center w-full flex-1 bg-white">
                <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-2">// PROCESSING</div>
                <div className="text-3xl font-black text-[#000005] uppercase tracking-tight mb-6">
                    Calculating Quote
                </div>
                <div className="flex gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce" />
                </div>
            </div>
        );
    }

    if (quoteData) {
        return <QuoteBreakdown quoteData={quoteData} numStandees={standeeCount === "" ? 0 : standeeCount} onBack={() => setQuoteData(null)} />;
    }

    return (
        <div className="flex flex-col items-center w-full flex-1 overflow-hidden px-10 py-6 bg-[#F8F8F8]">
            {/* Title */}
            <div className="w-full max-w-2xl mb-4 shrink-0">
                <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// ESTIMATOR</div>
                <div className="text-3xl font-black text-[#000005] uppercase tracking-tight">
                    Quote Estimate
                </div>
                <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">Configure parameters to generate a cost estimate</p>
            </div>

            {/* Form card */}
            <div className="flex flex-col w-full max-w-2xl flex-1 min-h-0 border-2 bg-white border-[#E0E0E0] rounded-sm text-[#B1B3B6] overflow-hidden">

                {/* 01 - COUNTS */}
                <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#E0E0E0] shrink-0">
                    <div className="text-[10px] font-black mb-3 uppercase tracking-widest text-[#000005]">
                        <span className="text-[#FFC843]">// </span>01 — COUNTS
                    </div>
                    <div className="flex flex-row gap-8 w-full">
                        <div>
                            <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">Standee Type</div>
                            <Dropdown
                                key={resetKey}
                                options={["Simple", "Moderate", "Complex"]}
                                currOption={standeeType}
                                onSelect={(val: StandeeType) => setStandeeType(val)}
                            />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">Standee Count</div>
                            <input
                                type="number"
                                min={0}
                                value={standeeCount}
                                onChange={(e) =>
                                    setStandeeCount(e.target.value === "" ? "" : Number(e.target.value))
                                }
                                placeholder="0"
                                className="border-2 border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-[200px] bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* 02 - ELEMENTS */}
                <div className="flex flex-col flex-1 min-h-0 items-start w-full p-4 border-b-2 border-[#E0E0E0] overflow-hidden">
                    <div className="text-[10px] font-black mb-3 uppercase tracking-widest text-[#000005]">
                        <span className="text-[#FFC843]">// </span>02 — ELEMENTS
                        <span className="ml-2 text-[#FFC843] font-bold">({elements.length} added)</span>
                    </div>
                    <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                        <ElementsManager key={resetKey} elements={elements} setElements={setElements} />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex w-full flex-row items-center px-4 py-3 gap-4 shrink-0">
                    <div
                        onClick={handleClear}
                        className="text-xs text-center font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-3 rounded-sm flex-1 cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200 uppercase tracking-widest"
                    >
                        CLEAR
                    </div>
                    <div
                        onClick={handleQuoteGeneration}
                        className="group flex flex-row justify-center gap-4 text-xs font-black bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white py-3 rounded-sm flex-[2] cursor-pointer transition-all duration-200 ease-in-out uppercase tracking-widest"
                    >
                        CALCULATE <img src="/submitarrow.svg" alt="" className="transition-all duration-300 ease-in-out group-hover:translate-x-1 group-hover:invert" />
                    </div>
                </div>
            </div>
        </div>
    );
}
