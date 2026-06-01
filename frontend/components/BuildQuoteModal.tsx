"use client";
import { useEffect, useState } from "react";
import Dropdown from "@/components/Dropdown";

type QuoteScenarioId = 1 | 2 | 3 | 4 | 5;

const SCENARIO_LABELS: Record<QuoteScenarioId, string> = {
    1: "Internal — Packed Out (1)",
    2: "Internal — Assembled (2)",
    3: "Hybrid — Internal Finishing (3)",
    4: "Hybrid — External Die Cut (4)",
    5: "External — Full Outsource (5)",
};

const SCENARIO_ORDER: QuoteScenarioId[] = [1, 2, 3, 4, 5];

type Props = {
    open: boolean;
    onClose: () => void;
    quoteName: string;
    onQuoteNameChange: (name: string) => void;
    scenario: QuoteScenarioId;
    onScenarioChange: (id: QuoteScenarioId) => void;
    quantity: number | "";
    onQuantityChange: (qty: number | "") => void;
    canSubmit: boolean;
    onSubmit: () => void;
};

export default function BuildQuoteModal({
    open,
    onClose,
    quoteName,
    onQuoteNameChange,
    scenario,
    onScenarioChange,
    quantity,
    onQuantityChange,
    canSubmit,
    onSubmit,
}: Props) {
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            const id = setTimeout(() => setVisible(true), 10);
            return () => clearTimeout(id);
        } else {
            setVisible(false);
            const id = setTimeout(() => setMounted(false), 320);
            return () => clearTimeout(id);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!mounted) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-[background-color] duration-300 ${
                visible ? "bg-[#000005]/40" : "bg-[#000005]/0"
            }`}
            role="presentation"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="build-quote-title"
                className={`w-full max-w-md border-2 border-[#000005] bg-white rounded-sm p-6 flex flex-col gap-5 ${
                    visible ? "modal-slide-up" : "modal-slide-down"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div>
                    <div className="text-[10px] font-black text-[#FFC843] tracking-widest uppercase mb-1">
                        // NEW QUOTE
                    </div>
                    <h2
                        id="build-quote-title"
                        className="text-xl font-black text-[#000005] uppercase tracking-tight"
                    >
                        Build new quote
                    </h2>
                    <p className="text-[11px] text-[#B1B3B6] font-semibold mt-1">
                        Name the quote and run the calculator. If you are signed in and this project is
                        saved, the quote is stored under the project.
                    </p>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6]">
                        Quote name
                    </span>
                    <input
                        type="text"
                        value={quoteName}
                        onChange={(e) => onQuoteNameChange(e.target.value)}
                        className="border-2 border-[#E0E0E0] rounded-sm p-2 outline-none text-[#000005] text-xs w-full bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6]">
                        Production scenario
                    </span>
                    <Dropdown
                        options={SCENARIO_ORDER.map((id) => SCENARIO_LABELS[id])}
                        currOption={SCENARIO_LABELS[scenario]}
                        onSelect={(label: string) => {
                            const id = SCENARIO_ORDER.find((sid) => SCENARIO_LABELS[sid] === label);
                            if (id !== undefined) onScenarioChange(id);
                        }}
                        width="w-full"
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6]">
                        Standee quantity
                    </span>
                    <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) => onQuantityChange(e.target.value === "" ? "" : Number(e.target.value))}
                        className="border-2 border-[#E0E0E0] rounded-sm p-2 outline-none text-[#000005] text-xs w-full max-w-[200px] bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                    />
                </div>

                <div className="flex flex-row gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 text-xs font-black uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#E0E0E0] text-[#B1B3B6] hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={onSubmit}
                        className={`flex-1 text-xs font-black uppercase tracking-widest py-2.5 rounded-sm border-2 transition-all duration-200 ${
                            canSubmit
                                ? "border-[#000005] bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white hover:border-[#000005] cursor-pointer"
                                : "border-[#E0E0E0] bg-[#F4F4F4] text-[#B1B3B6] cursor-not-allowed"
                        }`}
                    >
                        Build quote
                    </button>
                </div>
            </div>
        </div>
    );
}
