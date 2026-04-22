"use client";
import { useState } from "react";

type ScenarioId = 1 | 2 | 3 | 4 | 5;

type CostLine = {
    key: string;
    label: string;
    unit: string;   // display label for the qty column; "flat" hides qty entirely
    qty: number;
    unitCost: number;
};

type QuoteData = { total_static_cost: number };

type Props = {
    quoteData: QuoteData;
    numStandees: number;
    onBack: () => void;
};

// ─── static data ───────────────────────────────────────────────────────────

const SCENARIO_META: Record<ScenarioId, { short: string; sub: string }> = {
    1: { short: "Internal",  sub: "Packed Out" },
    2: { short: "Internal",  sub: "Assembled" },
    3: { short: "Hybrid",    sub: "Internal Finishing" },
    4: { short: "Hybrid",    sub: "External Die Cut" },
    5: { short: "External",  sub: "Full Outsource" },
};

type LineDef = { label: string; unit: string };

const UNIVERSAL_LINE_DEFS: Record<string, LineDef> = {
    corrugate_cost:          { label: "Corrugate",            unit: "forms"    },
    imposition_cost:         { label: "Imposition Labor",     unit: "hrs"      },
    blank_comp_cost:         { label: "Blank Comp",           unit: "units"    },
    color_comp_cost:         { label: "Color Comp",           unit: "units"    },
    engineering_design_cost: { label: "Engineering & Design", unit: "flat"     },
    hardware_cost:           { label: "Hardware",             unit: "standees" },
};

const SCENARIO_LINE_DEFS: Record<string, LineDef> = {
    print_form_cost:         { label: "Print Form Material",                          unit: "forms"    },
    zund_cut_cost:           { label: "Zund Cut Labor",                               unit: "hrs"      },
    die_cost:                { label: "Die Cost",                                     unit: "dies"     },
    pallet_cost:             { label: "Pallet & Labor",                               unit: "pallets"  },
    shipping_box_cost:       { label: "Shipping Box",                                 unit: "standees" },
    label_cost:              { label: "Labels",                                       unit: "standees" },
    instruction_sheet_cost:  { label: "Instruction Sheet",                            unit: "standees" },
    external_assembly:       { label: "External Assembly & Kitting",                  unit: "flat"     },
    external_mount_assembly: { label: "External Mount, Die Cut & Assembly",           unit: "flat"     },
    full_out_source:         { label: "Full Outsource (Print, Mount, Die Cut, Assem.)", unit: "flat"  },
};

const SCENARIO_KEYS: Record<ScenarioId, string[]> = {
    1: ["print_form_cost", "zund_cut_cost", "pallet_cost", "instruction_sheet_cost"],
    2: ["print_form_cost", "zund_cut_cost", "pallet_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost"],
    3: ["print_form_cost", "zund_cut_cost", "pallet_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "external_assembly"],
    4: ["print_form_cost", "die_cost",      "pallet_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "external_mount_assembly"],
    5: ["full_out_source"],
};

// ─── helpers ───────────────────────────────────────────────────────────────

function lineTotal(l: CostLine) {
    return l.unit === "flat" ? l.unitCost : l.qty * l.unitCost;
}

function buildLines(keys: string[], defs: Record<string, LineDef>): CostLine[] {
    return keys.map((key) => ({
        key,
        label:    defs[key]?.label ?? key,
        unit:     defs[key]?.unit  ?? "units",
        qty:      1,
        unitCost: 0,
    }));
}

// ─── CostRow ───────────────────────────────────────────────────────────────

function CostRow({
    line,
    onChange,
}: {
    line: CostLine;
    onChange: (key: string, field: "qty" | "unitCost", value: number) => void;
}) {
    const isFlat  = line.unit === "flat";
    const total   = lineTotal(line);

    return (
        <div className="grid grid-cols-[1fr_auto] items-center gap-6 py-2.5 border-b border-[#F4F4F4] last:border-0">
            {/* Label + unit badge */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-[#333]">{line.label}</span>
                {!isFlat && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide bg-[#F0F0F0] text-[#888] rounded px-1.5 py-0.5">
                        {line.unit}
                    </span>
                )}
                {isFlat && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide bg-[#EEF6FF] text-[#5B8FCC] rounded px-1.5 py-0.5">
                        flat
                    </span>
                )}
            </div>

            <div className="flex items-center gap-3">
                {/* Qty — hidden for flat */}
                {!isFlat && (
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[9px] text-[#ABABAB] uppercase font-semibold">qty</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={line.qty}
                            onChange={(e) => onChange(line.key, "qty", parseFloat(e.target.value) || 0)}
                            className="border border-[#E0E0E0] rounded-md px-2 py-1 text-xs text-black outline-none bg-[#FAFAFA] focus:border-[#FFB604] focus:bg-white w-[68px] text-right transition-colors"
                        />
                    </div>
                )}

                {/* Unit cost / flat cost */}
                <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[9px] text-[#ABABAB] uppercase font-semibold">
                        {isFlat ? "cost ($)" : "$/unit"}
                    </span>
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitCost}
                        onChange={(e) => onChange(line.key, "unitCost", parseFloat(e.target.value) || 0)}
                        className="border border-[#E0E0E0] rounded-md px-2 py-1 text-xs text-black outline-none bg-[#FAFAFA] focus:border-[#FFB604] focus:bg-white w-[96px] text-right transition-colors"
                    />
                </div>

                {/* Line total */}
                <div className="flex flex-col items-end gap-0.5 w-[80px]">
                    <span className="text-[9px] text-[#ABABAB] uppercase font-semibold">total</span>
                    <span className="text-xs font-bold text-[#222]">${total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}

// ─── main component ────────────────────────────────────────────────────────

export default function QuoteBreakdown({ numStandees: initialStandees, onBack }: Props) {
    const [activeScenario, setActiveScenario] = useState<ScenarioId>(1);
    const [numStandees, setNumStandees]        = useState<number>(initialStandees);

    const [universalLines, setUniversalLines] = useState<CostLine[]>(
        buildLines(Object.keys(UNIVERSAL_LINE_DEFS), UNIVERSAL_LINE_DEFS)
    );

    const [scenarioLines, setScenarioLines] = useState<Record<ScenarioId, CostLine[]>>({
        1: buildLines(SCENARIO_KEYS[1], SCENARIO_LINE_DEFS),
        2: buildLines(SCENARIO_KEYS[2], SCENARIO_LINE_DEFS),
        3: buildLines(SCENARIO_KEYS[3], SCENARIO_LINE_DEFS),
        4: buildLines(SCENARIO_KEYS[4], SCENARIO_LINE_DEFS),
        5: buildLines(SCENARIO_KEYS[5], SCENARIO_LINE_DEFS),
    });

    function syncStandeesQty(qty: number, lines: CostLine[]): CostLine[] {
        return lines.map((l) => (l.unit === "standees" ? { ...l, qty } : l));
    }

    function handleStandeesChange(value: number) {
        setNumStandees(value);
        setUniversalLines((prev) => syncStandeesQty(value, prev));
        setScenarioLines((prev) => ({
            1: syncStandeesQty(value, prev[1]),
            2: syncStandeesQty(value, prev[2]),
            3: syncStandeesQty(value, prev[3]),
            4: syncStandeesQty(value, prev[4]),
            5: syncStandeesQty(value, prev[5]),
        }));
    }

    function updateUniversal(key: string, field: "qty" | "unitCost", value: number) {
        if (field === "qty") {
            const line = universalLines.find((l) => l.key === key);
            if (line?.unit === "standees") { handleStandeesChange(value); return; }
        }
        setUniversalLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
    }

    function updateScenario(key: string, field: "qty" | "unitCost", value: number) {
        if (field === "qty") {
            const line = scenarioLines[activeScenario].find((l) => l.key === key);
            if (line?.unit === "standees") { handleStandeesChange(value); return; }
        }
        setScenarioLines((prev) => ({
            ...prev,
            [activeScenario]: prev[activeScenario].map((l) => (l.key === key ? { ...l, [field]: value } : l)),
        }));
    }

    const universalTotal = universalLines.reduce((s, l) => s + lineTotal(l), 0);
    const scenarioTotal  = scenarioLines[activeScenario].reduce((s, l) => s + lineTotal(l), 0);
    const grandTotal     = universalTotal + scenarioTotal;

    return (
        <div className="grid grid-cols-[220px_1fr] w-full flex-1 overflow-hidden text-black">

            {/* ── Sidebar ── */}
            <div className="flex flex-col bg-[#FAFAFA] border-r border-[#EAEAEA] px-5 py-6 gap-2">
                <div className="text-[1.2em] font-bold mb-1">Scenarios</div>
                <ul className="flex flex-col gap-4 w-full">
                    {([1, 2, 3, 4, 5] as ScenarioId[]).map((id) => (
                        <li
                            key={id}
                            onClick={() => setActiveScenario(id)}
                            className={`${activeScenario === id ? "tab-active" : "tab-inactive"} flex flex-col gap-0.5 w-full cursor-pointer`}
                        >
                            <span className="text-xs font-bold">Scenario {id} — {SCENARIO_META[id].short}</span>
                            <span className="text-[10px] text-[#ABABAB]">{SCENARIO_META[id].sub}</span>
                        </li>
                    ))}
                </ul>

                <button
                    onClick={onBack}
                    className="mt-auto w-full text-xs font-bold text-[#ABABAB] border-2 border-[#EDEAEA] py-2 rounded-md cursor-pointer hover:bg-[#EDEAEA] transition-all duration-250"
                >
                    ← Back
                </button>
            </div>

            {/* ── Main ── */}
            <div className="flex flex-col overflow-hidden px-8 py-6 gap-5">

                {/* Title */}
                <div className="shrink-0">
                    <div className="text-[2.5em] font-instrument leading-tight">
                        <span className="italic text-[#FFB604]">Quote</span> Breakdown
                    </div>
                    <p className="text-xs text-[#ABABAB] mt-0.5">
                        Viewing Scenario {activeScenario} — {SCENARIO_META[activeScenario].short}: {SCENARIO_META[activeScenario].sub}
                    </p>
                </div>

                {/* Parameters card */}
                <div className="shrink-0 flex items-center gap-6 bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl px-5 py-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-[#ABABAB] uppercase tracking-wider">Number of Standees</span>
                        <input
                            type="number"
                            min={0}
                            value={numStandees}
                            onChange={(e) => handleStandeesChange(parseInt(e.target.value) || 0)}
                            className="border border-[#DCDCDC] rounded-lg px-3 py-1.5 text-sm font-bold text-black outline-none bg-white focus:border-[#FFB604] w-[140px] text-right transition-colors"
                        />
                    </div>
                    <div className="h-10 w-px bg-[#E8E8E8]" />
                    <div className="text-xs text-[#ABABAB]">
                        Adjust the standee count and individual line items below to refine the estimate.
                    </div>
                </div>

                {/* Scrollable cost sections */}
                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto gap-4">

                    {/* Universal costs */}
                    <div className="border border-[#EAEAEA] rounded-xl bg-white p-4">
                        <p className="text-[10px] font-bold text-[#ABABAB] uppercase tracking-wider mb-3">Universal Costs</p>
                        {universalLines.map((line) => (
                            <CostRow key={line.key} line={line} onChange={updateUniversal} />
                        ))}
                        <div className="flex justify-between items-center pt-3 mt-1 border-t border-[#F4F4F4]">
                            <span className="text-xs font-bold text-[#888]">Subtotal</span>
                            <span className="text-xs font-bold text-[#444]">${universalTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Scenario costs */}
                    <div className="border border-[#EAEAEA] rounded-xl bg-white p-4">
                        <p className="text-[10px] font-bold text-[#ABABAB] uppercase tracking-wider mb-3">
                            Scenario {activeScenario} Costs
                        </p>
                        {scenarioLines[activeScenario].map((line) => (
                            <CostRow key={line.key} line={line} onChange={updateScenario} />
                        ))}
                        <div className="flex justify-between items-center pt-3 mt-1 border-t border-[#F4F4F4]">
                            <span className="text-xs font-bold text-[#888]">Subtotal</span>
                            <span className="text-xs font-bold text-[#444]">${scenarioTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Grand total */}
                    <div className="shrink-0 flex items-center justify-between bg-black text-white rounded-xl px-5 py-4">
                        <span className="text-sm font-bold">Total Estimated Cost</span>
                        <span className="text-2xl font-bold text-[#FFB604]">${grandTotal.toFixed(2)}</span>
                    </div>

                </div>
            </div>
        </div>
    );
}
