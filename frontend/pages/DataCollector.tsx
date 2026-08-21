"use client";
import { useState } from "react";
import UnitCostsModule  from "@/components/datacollector/UnitCostsModule";
import StandeeModule    from "@/components/datacollector/StandeeModule";
import OversModule      from "@/components/datacollector/OversModule";
import SuppliersModule  from "@/components/datacollector/SuppliersModule";
import PackoutModule    from "@/components/datacollector/PackoutModule";
import TemplatePricingModule from "@/components/datacollector/TemplatePricingModule";

// Each module tab maps to a self-contained component that owns its own state and API calls.
type ModuleId = 0 | 1 | 2 | 3 | 4 | 5;

const MODULE_NAV_LABELS   = ["Unit Costs", "Standee Static Costs", "Overs", "Suppliers", "Packout", "Template Pricing"] as const;
const MODULE_TITLE_LABELS = ["Unit", "Standee Static", "Overs", "Supplier", "Packout", "Template Pricing"] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MODULE_ICONS = [
    // DollarSign — Unit Costs
    <svg key="unit" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    // Layers — Standee Static Costs
    <svg key="standee" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    // TrendingUp — Overs
    <svg key="overs" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    // Truck — Suppliers
    <svg key="suppliers" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    // Package — Packout
    <svg key="packout" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
];

export default function DataCollector() {
    const [activeModule, setActiveModule] = useState<ModuleId>(0);

    return (
        <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">

            {/* ── Left sidebar — module navigation ── */}
            <div className="flex flex-col items-start justify-start py-8 px-5 gap-7 ">

                {/* Header */}
                <div className="flex flex-col gap-0.5 pl-3">
                    <span className="flex flex-row items-center text-[11px] font-bold tracking-[0.2em] uppercase text-[#B1B3B6] gap-[10px]">Database </span>
                    <div className="flex items-center gap-2">
                        <span className="text-[1.25em] font-bold text-[#000005]">Modules</span>
                        
                        
                    </div>
                </div>

                {/* Nav items */}
                <ul className="flex flex-col gap-1 w-full">
                    {([0, 1, 2, 3, 4, 5] as ModuleId[]).map((id) => (
                        <li
                            key={id}
                            onClick={() => setActiveModule(id)}
                            className={`
                                flex items-center gap-3 w-full h-[48px] cursor-pointer py-3 px-3 rounded-r-lg
                                border-l-4 transition-all duration-200 select-none
                                ${activeModule === id
                                    ? "border-[#FFC843] bg-[#fff7dd] text-[#000005] font-bold"
                                    : "border-transparent text-[#B1B3B6] font-medium hover:bg-[#F5F5F5] hover:text-[#000005]"
                                }
                            `}
                        >
                            {/* <span className={activeModule === id ? "text-[#FFC843]" : "text-[#C8C8C8]"}>
                                {MODULE_ICONS[id]}
                            </span> */}
                            <span className="text-[1.25rem] leading-none">{MODULE_NAV_LABELS[id]}</span>
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
                <div className="flex flex-col w-[65vw] h-[74vh] border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB]">
                    {activeModule === 0 && <UnitCostsModule />}
                    {activeModule === 1 && <StandeeModule />}
                    {activeModule === 2 && <OversModule />}
                    {activeModule === 3 && <SuppliersModule />}
                    {activeModule === 4 && <PackoutModule />}
                    {activeModule === 5 && <TemplatePricingModule />}
                </div>
            </div>
        </div>
    );
}
