"use client";
import { useState } from "react";
import { type QuoteData, type RequestPayload } from "@/pages/Inputter";

type ScenarioId = 1 | 2 | 3 | 4 | 5;

type CostLine = {
    key: string;
    label: string;
    unit: string;
    qty: number;
    unitCost: number;
};

type Props = {
    quoteData: QuoteData;
    numStandees: number;
    requestPayload: RequestPayload;
    onBack: () => void;
};

const SCENARIO_META: Record<ScenarioId, { short: string; sub: string }> = {
    1: { short: "Internal",  sub: "Packed Out" },
    2: { short: "Internal",  sub: "Assembled" },
    3: { short: "Hybrid",    sub: "Internal Finishing" },
    4: { short: "Hybrid",    sub: "External Die Cut" },
    5: { short: "External",  sub: "Full Outsource" },
};

type LineDef = { label: string; unit: string };

const UNIVERSAL_LINE_DEFS: Record<string, LineDef> = {
    imposition_cost:         { label: "Imposition Labor",     unit: "hrs"      },
    blank_comp_cost:         { label: "Blank Comp",           unit: "units"    },
    color_comp_cost:         { label: "Color Comp",           unit: "units"    },
    engineering_design_cost: { label: "Engineering & Design", unit: "flat"     },
    hardware_cost:           { label: "Hardware",             unit: "standees" },
};

const SCENARIO_LINE_DEFS: Record<string, LineDef> = {
    corrugate_cost:         { label: "Corrugate",                                      unit: "forms"    },
    print_form_cost:        { label: "Print Form Material",                            unit: "forms"    },
    rho_print_cost:         { label: "Rho Print",                                      unit: "flat"     },
    laminator_cost:         { label: "Laminator",                                      unit: "flat"     },
    zund_cut_cost:          { label: "Zund Cut Labor",                                 unit: "hrs"      },
    die_cost:               { label: "Die Cost",                                       unit: "dies"     },
    pallet_material_cost:   { label: "Pallets",                                         unit: "pallets"  },
    pallet_labor_cost:      { label: "Pallet Labor",                                    unit: "pallets"  },
    shipping_box_cost:      { label: "Shipping Box",                                   unit: "standees" },
    label_cost:             { label: "Labels",                                         unit: "standees" },
    instruction_sheet_cost: { label: "Instruction Sheet",                              unit: "standees" },
    freight_cost:           { label: "External Vendor Cost",                           unit: "flat"     },
    full_out_source:        { label: "Full Outsource (Print, Mount, Die Cut, Assem.)", unit: "flat"     },
};

const SCENARIO_KEYS: Record<ScenarioId, string[]> = {
    1: ["corrugate_cost", "print_form_cost", "rho_print_cost", "laminator_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost"],
    2: ["corrugate_cost", "print_form_cost", "rho_print_cost", "laminator_cost", "zund_cut_cost", "shipping_box_cost", "label_cost"],
    3: ["corrugate_cost", "print_form_cost", "rho_print_cost", "laminator_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost"],
    4: ["print_form_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "die_cost"],
    5: ["full_out_source"],
};

function lineTotal(l: CostLine) {
    return l.unit === "flat" ? l.unitCost : l.qty * l.unitCost;
}

// Maps each cost key to a function that derives its qty from the backend source object.
// The backend returns total costs, so we need qty to back-compute the per-unit cost.
const QTY_FROM_SOURCE: Partial<Record<string, (s: Record<string, number>) => number>> = {
    imposition_cost:        (s) => s.imposition_hours    ?? 1,
    blank_comp_cost:        (s) => s.blank_comp_count    ?? 1,
    color_comp_cost:        (s) => s.color_comp_count    ?? 1,
    hardware_cost:          (s) => s.num_standees         ?? 1,
    corrugate_cost:         (s) => (s.blank_forms_per_standee ?? 1) * (s.num_standees ?? 1),
    print_form_cost:        (s) => (s.print_forms_per_standee ?? 1) * (s.num_standees ?? 1),
    zund_cut_cost:          (s) => s.zund_hours           ?? 1,
    shipping_box_cost:      (s) => s.num_standees         ?? 1,
    label_cost:             (s) => s.num_standees         ?? 1,
    instruction_sheet_cost: (s) => s.num_standees         ?? 1,
    pallet_material_cost:   (s) => s.pallet_count         ?? 1,
    pallet_labor_cost:      (s) => s.pallet_count         ?? 1,
};

function buildLines(keys: string[], defs: Record<string, LineDef>): CostLine[] {
    return keys.map((key) => ({
        key,
        label:    defs[key]?.label ?? key,
        unit:     defs[key]?.unit  ?? "units",
        qty:      1,
        unitCost: 0,
    }));
}

function seedLines(lines: CostLine[], source: Record<string, number>): CostLine[] {
    return lines.map((line) => {
        const total  = source[line.key] ?? 0;
        const isFlat = line.unit === "flat";
        if (isFlat) return { ...line, unitCost: total };

        const getQty = QTY_FROM_SOURCE[line.key];
        const qty    = getQty ? Math.max(getQty(source), 1) : 1;
        return { ...line, qty, unitCost: total / qty };
    });
}

function CostRow({
    line,
    onChange,
}: {
    line: CostLine;
    onChange: (key: string, field: "qty" | "unitCost", value: number) => void;
}) {
    const isFlat = line.unit === "flat";
    const total  = lineTotal(line);

    return (
        <div className="grid grid-cols-[1fr_auto] items-center gap-6 py-2.5 border-b border-[#F0F0F0] last:border-0">
            <div className="flex items-center gap-2">
                <span className="text-xs text-[#000005] font-semibold">{line.label}</span>
                {!isFlat && (
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-[#F0F0F0] text-[#B1B3B6] rounded-sm px-1.5 py-0.5">
                        {line.unit}
                    </span>
                )}
                {isFlat && (
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-[#FFF8E1] text-[#F57F17] rounded-sm px-1.5 py-0.5">
                        flat
                    </span>
                )}
            </div>

            <div className="flex items-center gap-3">
                {!isFlat && (
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">qty</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={line.qty}
                            onChange={(e) => onChange(line.key, "qty", parseFloat(e.target.value) || 0)}
                            className="border border-[#E0E0E0] rounded-sm px-2 py-1 text-xs text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] focus:bg-white w-[68px] text-right transition-colors font-semibold"
                        />
                    </div>
                )}

                <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">
                        {isFlat ? "cost ($)" : "$/unit"}
                    </span>
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitCost}
                        onChange={(e) => onChange(line.key, "unitCost", parseFloat(e.target.value) || 0)}
                        className="border border-[#E0E0E0] rounded-sm px-2 py-1 text-xs text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] focus:bg-white w-[96px] text-right transition-colors font-semibold"
                    />
                </div>

                <div className="flex flex-col items-end gap-0.5 w-[80px]">
                    <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">total</span>
                    <span className="text-xs font-black text-[#000005]">${total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}

function buildAllLines(sources: Record<ScenarioId, Record<string, number>>) {
    return {
        universal: seedLines(buildLines(Object.keys(UNIVERSAL_LINE_DEFS), UNIVERSAL_LINE_DEFS), sources[1]),
        scenario: {
            1: seedLines(buildLines(SCENARIO_KEYS[1], SCENARIO_LINE_DEFS), sources[1]),
            2: seedLines(buildLines(SCENARIO_KEYS[2], SCENARIO_LINE_DEFS), sources[2]),
            3: seedLines(buildLines(SCENARIO_KEYS[3], SCENARIO_LINE_DEFS), sources[3]),
            4: seedLines(buildLines(SCENARIO_KEYS[4], SCENARIO_LINE_DEFS), sources[4]),
            5: buildLines(SCENARIO_KEYS[5], SCENARIO_LINE_DEFS),
        } as Record<ScenarioId, CostLine[]>,
    };
}

export default function QuoteBreakdown({ quoteData, numStandees: initialStandees, requestPayload, onBack }: Props) {
    const [activeScenario, setActiveScenario] = useState<ScenarioId>(1);
    const [numStandees, setNumStandees]        = useState<number>(initialStandees);
    const [isRecalculating, setIsRecalculating] = useState(false);

    // Resolve each scenario's source data (fall back to empty object if not returned)
    const initialSources: Record<ScenarioId, Record<string, number>> = {
        1: quoteData["scenario_1"] ?? {},
        2: quoteData["scenario_2"] ?? {},
        3: quoteData["scenario_3"] ?? {},
        4: quoteData["scenario_4"] ?? {},
        5: {},
    };

    const [printFormsPerStandee, setPrintFormsPerStandee] = useState<number>(
        initialSources[1].print_forms_per_standee ?? 1
    );
    const [structureFormsPerStandee, setStructureFormsPerStandee] = useState<number>(
        initialSources[1].structure_forms_per_standee ?? 0
    );

    const { universal: initUniversal, scenario: initScenario } = buildAllLines(initialSources);
    const [universalLines, setUniversalLines] = useState<CostLine[]>(initUniversal);
    const [scenarioLines, setScenarioLines]   = useState<Record<ScenarioId, CostLine[]>>(initScenario);

    function recalculate() {
        setIsRecalculating(true);
        const body = {
            ...requestPayload,
            num_standees: numStandees,
            print_forms_per_standee: printFormsPerStandee,
            structure_forms_per_standee: structureFormsPerStandee,
        };
        fetch("http://localhost:8000/generate_quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then((res) => {
                if (!res.ok) {
                    res.json().then((err) => console.error("Recalculate 422 details:", err));
                    return null;
                }
                return res.json();
            })
            .then((data) => {
                if (!data) return;
                const sources: Record<ScenarioId, Record<string, number>> = {
                    1: data["scenario_1"] ?? {},
                    2: data["scenario_2"] ?? {},
                    3: data["scenario_3"] ?? {},
                    4: data["scenario_4"] ?? {},
                    5: {},
                };
                const { universal, scenario } = buildAllLines(sources);
                setUniversalLines(universal);
                setScenarioLines(scenario);
            })
            .catch((err) => console.error("Recalculate error:", err))
            .finally(() => setIsRecalculating(false));
    }

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

    // Which scenario IDs were actually returned by the backend
    const availableScenarios: ScenarioId[] = [1, 2, 3, 4, 5].filter((id) =>
        id === 5 || quoteData[`scenario_${id}`] !== undefined
    ) as ScenarioId[];

    return (
        <div className="grid grid-cols-[220px_1fr] w-full flex-1 overflow-hidden text-[#000005]">

            {/* ── Sidebar ── */}
            <div className="flex flex-col bg-white border-r-2 border-[#E0E0E0] px-5 py-6 gap-2">
                <div className="text-[10px] font-black text-[#FFC843] tracking-widest uppercase mb-1">// SCENARIOS</div>
                <ul className="flex flex-col gap-3 w-full">
                    {availableScenarios.map((id) => (
                        <li
                            key={id}
                            onClick={() => setActiveScenario(id)}
                            className={`${activeScenario === id ? "tab-active" : "tab-inactive"} flex flex-col gap-0.5 w-full cursor-pointer`}
                        >
                            <span className="text-xs font-black uppercase tracking-wide">{SCENARIO_META[id].short}</span>
                            <span className="text-[10px] font-semibold text-[#B1B3B6]">{SCENARIO_META[id].sub}</span>
                        </li>
                    ))}
                </ul>

                <button
                    onClick={onBack}
                    className="mt-auto w-full text-xs font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-2 rounded-sm cursor-pointer hover:bg-[#000005] hover:text-white hover:border-[#000005] transition-all duration-200 uppercase tracking-widest"
                >
                    ← BACK
                </button>
            </div>

            {/* ── Main ── */}
            <div className="flex flex-col overflow-hidden px-8 py-6 gap-5 bg-[#F8F8F8]">

                {/* Title */}
                <div className="shrink-0">
                    <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// BREAKDOWN</div>
                    <div className="text-3xl font-black text-[#000005] uppercase tracking-tight">
                        Quote Breakdown
                    </div>
                    <p className="text-xs text-[#B1B3B6] mt-0.5 font-semibold">
                        Viewing Scenario {activeScenario} — {SCENARIO_META[activeScenario].short}: {SCENARIO_META[activeScenario].sub}
                    </p>
                </div>

                {/* Parameters card */}
                <div className="shrink-0 flex items-center gap-6 bg-white border-2 border-[#E0E0E0] rounded-sm px-5 py-4 flex-wrap">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Number of Standees</span>
                        <input
                            type="number"
                            min={0}
                            value={numStandees}
                            onChange={(e) => handleStandeesChange(parseInt(e.target.value) || 0)}
                            disabled={isRecalculating}
                            className="border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] w-[140px] text-right transition-colors disabled:opacity-50"
                        />
                    </div>
                    <div className="h-10 w-px bg-[#E0E0E0]" />
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Print Forms / Standee</span>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={printFormsPerStandee}
                            onChange={(e) => setPrintFormsPerStandee(Math.max(1, parseInt(e.target.value) || 1))}
                            disabled={isRecalculating}
                            className="border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] w-[100px] text-right transition-colors disabled:opacity-50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Structure Forms / Standee</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={structureFormsPerStandee}
                            onChange={(e) => setStructureFormsPerStandee(Math.max(0, parseInt(e.target.value) || 0))}
                            disabled={isRecalculating}
                            className="border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] w-[100px] text-right transition-colors disabled:opacity-50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Blank Forms / Standee</span>
                        <span className="text-sm font-black text-[#000005] text-right py-1.5">
                            {printFormsPerStandee + structureFormsPerStandee}
                        </span>
                    </div>
                    <div className="h-10 w-px bg-[#E0E0E0]" />
                    <button
                        onClick={recalculate}
                        disabled={isRecalculating}
                        className="text-xs font-black uppercase tracking-widest px-4 py-2 rounded-sm bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isRecalculating ? "Recalculating…" : "↻ Regenerate"}
                    </button>
                </div>

                {/* Scrollable cost sections */}
                <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto gap-4 transition-opacity duration-200 ${isRecalculating ? "opacity-40 pointer-events-none" : ""}`}>

                    {/* Universal costs */}
                    <div className="border-2 border-[#E0E0E0] rounded-sm bg-white p-4">
                        <p className="text-[10px] font-black text-[#000005] uppercase tracking-widest mb-3">
                            <span className="text-[#FFC843]">// </span>Universal Costs
                        </p>
                        {universalLines.map((line) => (
                            <CostRow key={line.key} line={line} onChange={updateUniversal} />
                        ))}
                        <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-[#F0F0F0]">
                            <span className="text-xs font-black text-[#B1B3B6] uppercase tracking-wider">Subtotal</span>
                            <span className="text-sm font-black text-[#000005]">${universalTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Scenario costs */}
                    <div className="border-2 border-[#E0E0E0] rounded-sm bg-white p-4">
                        <p className="text-[10px] font-black text-[#000005] uppercase tracking-widest mb-3">
                            <span className="text-[#FFC843]">// </span>Scenario {activeScenario} Costs
                        </p>
                        {scenarioLines[activeScenario].map((line) => (
                            <CostRow key={line.key} line={line} onChange={updateScenario} />
                        ))}
                        <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-[#F0F0F0]">
                            <span className="text-xs font-black text-[#B1B3B6] uppercase tracking-wider">Subtotal</span>
                            <span className="text-sm font-black text-[#000005]">${scenarioTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Grand total */}
                    <div className="shrink-0 flex items-center justify-between bg-[#000005] text-white rounded-sm px-5 py-4">
                        <span className="text-sm font-black uppercase tracking-widest">Total Estimated Cost</span>
                        <span className="text-2xl font-black text-[#FFC843]">${grandTotal.toFixed(2)}</span>
                    </div>

                </div>
            </div>
        </div>
    );
}
