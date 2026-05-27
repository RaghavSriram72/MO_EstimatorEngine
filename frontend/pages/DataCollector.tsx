"use client";
import { useState } from "react";
import UnitCostsModule  from "@/components/datacollector/UnitCostsModule";
import StandeeModule    from "@/components/datacollector/StandeeModule";
import OversModule      from "@/components/datacollector/OversModule";
import SuppliersModule  from "@/components/datacollector/SuppliersModule";

// Each module tab maps to a self-contained component that owns its own state and API calls.
type ModuleId = 0 | 1 | 2 | 3;

const MODULE_NAV_LABELS   = ["Unit Costs", "Standee Static Costs", "Overs", "Suppliers"] as const;
const MODULE_TITLE_LABELS = ["Unit", "Standee Static", "Overs", "Supplier"] as const;

export default function DataCollector() {
    const [activeModule, setActiveModule] = useState<ModuleId>(0);

    return (
        <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">

            {/* ── Left sidebar — module navigation ── */}
            <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                <div className="text-[1.2em] font-bold">DB Modules</div>
                <ul className="flex flex-col gap-4 w-full">
                    {([0, 1, 2, 3] as ModuleId[]).map((id) => (
                        <li
                            key={id}
                            className={`${activeModule === id ? "tab-active" : "tab-inactive"} flex items-center gap-5 w-full cursor-pointer`}
                            onClick={() => setActiveModule(id)}
                        >
                            <span>•</span> {MODULE_NAV_LABELS[id]}
                        </li>
                    ))}
                </ul>
            </div>

            {/* ── Main panel ── */}
            <div className="flex flex-col ml-5 p-1 justify-start">

                {/* Animated title — slides when switching modules */}
                <div className="relative ml-15 pb-3 h-[90px] overflow-hidden">
                    {MODULE_TITLE_LABELS.map((label, idx) => (
                        <div
                            key={idx}
                            className={`absolute inset-0 ${activeModule === idx ? "data-collector-title-active" : "data-collector-title-inactive"}`}
                        >
                            <div className="text-[3em] font-instrument">
                                Update <span className="italic text-[#FFB604]">{label}</span> Costs
                            </div>
                            <p className="text-xs">Modify Live Data for {label} Cost Records</p>
                        </div>
                    ))}
                </div>

                {/* Module panel — each module renders its own sections + footer */}
                <div className="flex flex-col w-[50vw] h-[74vh] border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB]">
                    {activeModule === 0 && <UnitCostsModule />}
                    {activeModule === 1 && <StandeeModule />}
                    {activeModule === 2 && <OversModule />}
                    {activeModule === 3 && <SuppliersModule />}
                </div>
            </div>
        </div>
    );
}
