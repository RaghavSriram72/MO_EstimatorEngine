"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type QuoteData, type QuoteBreakdownUi, type CostLineOverride, type ScenarioCostLineOverrides, type RequestPayload } from "@/pages/Inputter";
import { API_BASE } from "@/lib/config";
import { COST_LINE_TOOLTIPS } from "@/lib/costLineTooltips";
import { COST_DEBUG_ENABLED, extractDebugExplanations, debugExplanationsFromQuoteResponse, hasDebugExplanations, type CostDebugExplanations } from "@/lib/costDebugConfig";

type ScenarioId = 1 | 2 | 3 | 4 | 5;

type CostLine = {
    key: string;
    label: string;
    unit: string;
    qty: number;
    unitCost: number;
    readonlyQty?: boolean;
    rawTotal?: number; // when set, lineTotal uses this directly instead of qty × unitCost
};

type ScenarioParams = {
    numStandees: number;
    printFormsPerStandee: number;
    structureFormsPerStandee: number;
    overs: number;
};


type Props = {
    quoteData: QuoteData;
    numStandees: number;
    requestPayload: RequestPayload;
    initialActiveScenario?: ScenarioId;
    quoteName?: string | null;
    initialContributionMargin?: number | null;
    /** When set with ``quoteOwner``, edits can be persisted via PATCH. */
    persistedQuoteId?: string | null;
    quoteOwner?: string | null;
    onBack: () => void;
    /** Keeps parent sidebar / payload in sync when standee count is edited. */
    onNumStandeesChange?: (numStandees: number) => void;
};

function resolveInitialActiveScenario(quoteData: QuoteData, hint?: ScenarioId): ScenarioId {
    if (hint !== undefined && quoteData[`scenario_${hint}`] !== undefined) {
        return hint;
    }
    const first = [1, 2, 3, 4, 5].find((id) => quoteData[`scenario_${id}`] !== undefined);
    return (first as ScenarioId) ?? 1;
}

const SCENARIO_META: Record<ScenarioId, { short: string; sub: string }> = {
    1: { short: "Internal",  sub: "Packed Out" },
    2: { short: "Internal",  sub: "Assembled" },
    3: { short: "Hybrid",    sub: "Internal Finishing" },
    4: { short: "Hybrid",    sub: "External Die Cut" },
    5: { short: "External",  sub: "Full Outsource" },
};

type LineDef = { label: string; unit: string; readonlyQty?: boolean };

const UNIVERSAL_LINE_DEFS: Record<string, LineDef> = {
    imposition_cost:         { label: "Imposition Labor",     unit: "hrs"      },
    blank_comp_cost:         { label: "Blank Comp",           unit: "units"    },
    color_comp_cost:         { label: "Color Comp",           unit: "units"    },
    engineering_design_cost: { label: "Engineering & Design", unit: "flat"     },
    hardware_cost:           { label: "Hardware",             unit: "standees" },
};

const SCENARIO_LINE_DEFS: Record<string, LineDef> = {
    corrugate_cost:         { label: "Corrugate",            unit: "forms"    },
    print_form_cost:        { label: "Print Form Material",  unit: "forms"    },
    print_cost:             { label: "Rho Print",            unit: "hrs"      },
    rollx_cost:             { label: "Roll-X",               unit: "hrs"      },
    zund_cut_cost:          { label: "Zund Cutting",          unit: "hrs"      },
    die_cost:               { label: "Die Cost",             unit: "dies"     },
    pallet_material_cost:   { label: "Pallets",              unit: "pallets"  },
    pallet_labor_cost:      { label: "Pallet Labor",         unit: "pallets"  },
    shipping_box_cost:      { label: "Shipping Box",         unit: "standees" },
    label_cost:             { label: "Labels",               unit: "standees" },
    instruction_sheet_cost: { label: "Instruction Sheet",    unit: "standees" },
    freight_cost:               { label: "Freight Cost",            unit: "flat"     },
    kitting_and_assembly_cost:  { label: "Kitting & Assembly",      unit: "standees" },
    packout:                    { label: "Packout",                 unit: "standees" },
    litho_buyout_cost:          { label: "Litho Buyout",            unit: "sheets",   readonlyQty: true },
    mount_die_buyout_cost:      { label: "Mount & Die Cut Buyout",        unit: "standees", readonlyQty: true },
};

const SCENARIO_KEYS: Record<ScenarioId, string[]> = {
    1: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "kitting_and_assembly_cost"],
    2: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "kitting_and_assembly_cost"],
    3: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "packout"],
    4: ["mount_die_buyout_cost", "print_form_cost", "print_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "die_cost", "packout"],
    5: ["mount_die_buyout_cost", "litho_buyout_cost", "label_cost", "instruction_sheet_cost", "freight_cost", "die_cost", "packout"],
};


function lineTotal(l: CostLine) {
    if (l.rawTotal !== undefined) return l.rawTotal;
    return l.unit === "flat" ? l.unitCost : l.qty * l.unitCost;
}

function fmt(value: number): string {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Maps each cost key to a function that derives its qty from the backend source object.
const QTY_FROM_SOURCE: Partial<Record<string, (s: Record<string, number>) => number>> = {
    imposition_cost:        (s) => s.imposition_hours    ?? 1,
    blank_comp_cost:        (s) => s.blank_comp_count    ?? 1,
    color_comp_cost:        (s) => s.color_comp_count    ?? 1,
    hardware_cost:          (s) => s.num_standees         ?? 1,
    corrugate_cost:         (s) => (s.blank_forms_per_standee ?? 1) * (s.num_standees ?? 1),
    print_form_cost:        (s) => (s.print_forms_per_standee ?? 1) * (s.num_standees ?? 1),
    print_cost:             (s) => s.print_hours           ?? 1,
    rollx_cost:             (s) => s.rollx_hours           ?? 1,
    zund_cut_cost:          (s) => s.zund_hours            ?? 1,
    shipping_box_cost:      (s) => s.num_standees         ?? 1,
    label_cost:             (s) => s.num_standees         ?? 1,
    instruction_sheet_cost:     (s) => s.num_standees ?? 1,
    kitting_and_assembly_cost:  (s) => s.num_standees ?? 1,
    packout:                    (s) => s.num_standees ?? 1,
    litho_buyout_cost:          (s) => s.litho_sheets_per_form ?? 1,
    mount_die_buyout_cost:      (s) => s.num_standees ?? 1,
    pallet_material_cost:       (s) => s.pallet_count  ?? 1,
    pallet_labor_cost:          (s) => s.pallet_count  ?? 1,
};

// For lines where the backend provides a pre-computed unit cost instead of deriving total / qty.
// When this is set, the backend total is also stored as rawTotal so lineTotal stays accurate.
const UNIT_COST_FROM_SOURCE: Partial<Record<string, (s: Record<string, number>) => number>> = {
    litho_buyout_cost:     (s) => s.litho_buyout_unit_cost     ?? 0,
    mount_die_buyout_cost: (s) => s.mount_die_buyout_unit_cost ?? 0,
};

/** Persist edited row quantities back into scenario source fields (see QTY_FROM_SOURCE). */
const LINE_KEY_TO_QTY_SOURCE: Partial<Record<string, string>> = {
    imposition_cost: "imposition_hours",
    blank_comp_cost: "blank_comp_count",
    color_comp_cost: "color_comp_count",
    print_cost: "print_hours",
    rollx_cost: "rollx_hours",
    zund_cut_cost: "zund_hours",
    pallet_material_cost: "pallet_count",
    pallet_labor_cost: "pallet_count",
};

function buildLines(keys: string[], defs: Record<string, LineDef>): CostLine[] {
    return keys.map((key) => ({
        key,
        label:       defs[key]?.label       ?? key,
        unit:        defs[key]?.unit        ?? "units",
        readonlyQty: defs[key]?.readonlyQty ?? false,
        qty:         1,
        unitCost:    0,
    }));
}

function seedLines(lines: CostLine[], source: Record<string, number>): CostLine[] {
    return lines.map((line) => {
        const total  = source[line.key] ?? 0;
        const isFlat = line.unit === "flat";
        if (isFlat) return { ...line, unitCost: total };

        const getQty     = QTY_FROM_SOURCE[line.key];
        const rawQty     = getQty ? getQty(source) : 1;
        const qty        = rawQty > 0 ? rawQty : 1;
        const getUnitCost = UNIT_COST_FROM_SOURCE[line.key];
        const unitCost    = getUnitCost ? getUnitCost(source) : total / qty;
        // When unit cost is pre-computed, qty × unitCost won't equal the backend total,
        // so store rawTotal to use in lineTotal instead.
        const rawTotal    = getUnitCost ? total : undefined;
        return { ...line, qty, unitCost, rawTotal };
    });
}

function buildScenarioState(
    sources: Record<ScenarioId, Record<string, number>>,
    initialStandees: number,
    initialScenario: ScenarioId,
): {
    params: ScenarioParams;
    universalLines: CostLine[];
    scenarioLines: Record<ScenarioId, CostLine[]>;
} {
    const ids: ScenarioId[] = [1, 2, 3, 4, 5];
    const scenarioLines = {} as Record<ScenarioId, CostLine[]>;
    const seedSource = sources[initialScenario] ?? sources[1] ?? {};
    const params: ScenarioParams = {
        numStandees: initialStandees,
        printFormsPerStandee: seedSource.print_forms_per_standee ?? 1,
        structureFormsPerStandee: seedSource.structure_forms_per_standee ?? 0,
        overs: seedSource.overs ?? 0,
    };
    const universalLines = seedLines(
        buildLines(Object.keys(UNIVERSAL_LINE_DEFS), UNIVERSAL_LINE_DEFS),
        seedSource,
    );
    for (const id of ids) {
        const src = sources[id] ?? {};
        scenarioLines[id] = seedLines(buildLines(SCENARIO_KEYS[id], SCENARIO_LINE_DEFS), src);
    }
    return { params, universalLines, scenarioLines };
}

function breakdownUiFromQuoteData(q: QuoteData): QuoteBreakdownUi | undefined {
    const ui = q._breakdown_ui;
    if (!ui || typeof ui !== "object" || Array.isArray(ui)) return undefined;
    return ui as QuoteBreakdownUi;
}

function applyCostLineOverrides(
    universalLines: CostLine[],
    scenarioLines: Record<ScenarioId, CostLine[]>,
    ui: QuoteBreakdownUi | undefined,
): { universalLines: CostLine[]; scenarioLines: Record<ScenarioId, CostLine[]> } {
    const overrides = ui?.cost_line_overrides;
    if (!overrides || typeof overrides !== "object") {
        return { universalLines, scenarioLines };
    }
    // Apply universal overrides from the first scenario that has them (shared across all)
    let newUniversalLines = universalLines;
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const o = overrides[String(id)];
        if (!o?.universal) continue;
        newUniversalLines = universalLines.map((line) => {
            const ed = o.universal![line.key];
            return ed ? { ...line, qty: ed.qty, unitCost: ed.unitCost } : line;
        });
        break;
    }
    const nextSl = { ...scenarioLines };
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const o = overrides[String(id)];
        if (!o?.scenario) continue;
        nextSl[id] = scenarioLines[id].map((line) => {
            const ed = o.scenario![line.key];
            return ed ? { ...line, qty: ed.qty, unitCost: ed.unitCost } : line;
        });
    }
    return { universalLines: newUniversalLines, scenarioLines: nextSl };
}

function universalSubtotalOverrideFromUi(ui: QuoteBreakdownUi | undefined): string {
    const uo = ui?.universal_subtotal_override;
    if (!uo || typeof uo !== "object") return "";
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const raw = uo[String(id)];
        if (raw != null && String(raw).trim() !== "") return String(raw);
    }
    return "";
}

function scenarioSubtotalOverridesFromUi(ui: QuoteBreakdownUi | undefined): Record<ScenarioId, string> {
    const out: Record<ScenarioId, string> = { 1: "", 2: "", 3: "", 4: "", 5: "" };
    const so = ui?.scenario_subtotal_override;
    if (!so || typeof so !== "object") return out;
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const raw = so[String(id)];
        if (raw != null) out[id] = String(raw);
    }
    return out;
}

function serializeScenarioToSource(
    id: ScenarioId,
    sharedParams: ScenarioParams,
    universalLines: CostLine[],
    scenarioLines: Record<ScenarioId, CostLine[]>,
    initialSources: Record<ScenarioId, Record<string, unknown>>,
): Record<string, number> {
    const base: Record<string, number> = {};
    const src0 = initialSources[id] ?? {};
    for (const k of Object.keys(src0)) {
        const v = src0[k];
        if (typeof v === "number" && Number.isFinite(v)) {
            base[k] = v;
        }
    }
    const p = sharedParams;
    base.num_standees = p.numStandees;
    base.print_forms_per_standee = p.printFormsPerStandee;
    base.structure_forms_per_standee = p.structureFormsPerStandee;
    base.blank_forms_per_standee = p.printFormsPerStandee + p.structureFormsPerStandee;
    base.overs = p.overs;
    for (const line of universalLines) {
        base[line.key] = lineTotal(line);
        const qtySrc = LINE_KEY_TO_QTY_SOURCE[line.key];
        if (qtySrc) base[qtySrc] = line.qty;
    }
    for (const line of scenarioLines[id]) {
        base[line.key] = lineTotal(line);
        const qtySrc = LINE_KEY_TO_QTY_SOURCE[line.key];
        if (qtySrc) base[qtySrc] = line.qty;
    }
    return base;
}

function buildBreakdownUiPayloadFromState(
    universalLines: CostLine[],
    universalSubtotalOverride: string,
    scenarioLines: Record<ScenarioId, CostLine[]>,
    scenarioSubtotalOverride: Record<ScenarioId, string>,
): QuoteBreakdownUi | null {
    const universal_subtotal_override: Record<string, string> = {};
    const scenario_subtotal_override: Record<string, string> = {};
    const cost_line_overrides: Record<string, ScenarioCostLineOverrides> = {};

    const u = universalSubtotalOverride.trim();
    if (u) {
        for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
            universal_subtotal_override[String(id)] = u;
        }
    }

    const universal: Record<string, CostLineOverride> = {};
    for (const line of universalLines) {
        if (line.unit === "standees") continue;
        universal[line.key] = { qty: line.qty, unitCost: line.unitCost };
    }

    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const s = scenarioSubtotalOverride[id]?.trim() ?? "";
        if (s) scenario_subtotal_override[String(id)] = s;

        const scenario: Record<string, CostLineOverride> = {};
        for (const line of scenarioLines[id] ?? []) {
            if (line.unit === "standees") continue;
            scenario[line.key] = { qty: line.qty, unitCost: line.unitCost };
        }
        if (Object.keys(universal).length > 0 || Object.keys(scenario).length > 0) {
            cost_line_overrides[String(id)] = {
                ...(Object.keys(universal).length > 0 ? { universal } : {}),
                ...(Object.keys(scenario).length > 0 ? { scenario } : {}),
            };
        }
    }

    const out: QuoteBreakdownUi = {};
    if (Object.keys(universal_subtotal_override).length > 0) out.universal_subtotal_override = universal_subtotal_override;
    if (Object.keys(scenario_subtotal_override).length > 0) out.scenario_subtotal_override = scenario_subtotal_override;
    if (Object.keys(cost_line_overrides).length > 0) out.cost_line_overrides = cost_line_overrides;
    return Object.keys(out).length > 0 ? out : null;
}

function standeeTypeToPersistLabel(n: number): "Simple" | "Moderate" | "Complex" {
    const m: Record<number, "Simple" | "Moderate" | "Complex"> = {
        1: "Simple",
        2: "Moderate",
        3: "Complex",
    };
    return m[n] ?? "Simple";
}

function InfoTooltip({ text }: { text: string }) {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const iconRef = useRef<HTMLSpanElement>(null);

    function handleMouseEnter() {
        if (iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            const tooltipW = 208; // w-52
            const x = Math.min(
                Math.max(rect.left + rect.width / 2, tooltipW / 2 + 8),
                window.innerWidth - tooltipW / 2 - 8,
            );
            setPos({ x, y: rect.top - 8 });
        }
        setVisible(true);
    }

    return (
        <span
            ref={iconRef}
            className="inline-flex items-center shrink-0"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setVisible(false)}
        >
            <span className="w-3.5 h-3.5 rounded-full border cursor-pointer border-[#B1B3B6] text-[#B1B3B6] flex items-center justify-center text-[9px] font-black cursor-default select-none hover:border-[#FFC843] hover:text-[#FFC843] transition-colors leading-none">
                i
            </span>
            {visible && typeof document !== "undefined" && createPortal(
                <span
                    style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
                    className="fixed z-[9999] w-55 bg-[#000005] text-white text-[10px] font-semibold rounded-sm px-2.5 py-2 shadow-lg leading-snug pointer-events-none"
                >
                    {text}
                    <span className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-[#000005]" />
                </span>,
                document.body,
            )}
        </span>
    );
}

function DebugFormulaTooltip({ text, pending = false }: { text: string; pending?: boolean }) {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const iconRef = useRef<HTMLSpanElement>(null);

    function handleMouseEnter() {
        if (iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            const tooltipW = 320;
            const x = Math.min(
                Math.max(rect.left + rect.width / 2, tooltipW / 2 + 8),
                window.innerWidth - tooltipW / 2 - 8,
            );
            setPos({ x, y: rect.top - 8 });
        }
        setVisible(true);
    }

    const borderClass = pending ? "border-[#B1B3B6] text-[#B1B3B6]" : "border-[#F57F17] text-[#F57F17] hover:bg-[#FFF8E1]";

    return (
        <span
            ref={iconRef}
            className="inline-flex items-center shrink-0"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setVisible(false)}
        >
            <span
                title="Debug formula"
                className={`w-3.5 h-3.5 rounded-sm border cursor-pointer flex items-center justify-center text-[8px] font-black cursor-default select-none transition-colors leading-none ${borderClass}`}
            >
                ?
            </span>
            {visible && typeof document !== "undefined" && createPortal(
                <span
                    style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
                    className={`fixed z-[9999] w-80 max-w-[min(20rem,calc(100vw-1rem))] text-[10px] font-medium rounded-sm px-2.5 py-2 shadow-lg leading-snug pointer-events-none whitespace-pre-wrap ${
                        pending ? "bg-[#333] text-[#ccc]" : "bg-[#1a1200] text-[#FFE082]"
                    }`}
                >
                    {text}
                    <span className={`absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent ${pending ? "border-t-[#333]" : "border-t-[#1a1200]"}`} />
                </span>,
                document.body,
            )}
        </span>
    );
}

function CostRow({
    line,
    onChange,
    debugExplanation,
    debugPending = false,
    isEdited = false,
}: {
    line: CostLine;
    onChange: (key: string, field: "qty" | "unitCost", value: number) => void;
    debugExplanation?: string;
    debugPending?: boolean;
    isEdited?: boolean;
}) {
    const isFlat        = line.unit === "flat";
    const isStandees    = line.unit === "standees";
    const isReadonlyQty = isStandees || !!line.readonlyQty;
    const total         = lineTotal(line);
    const tooltip       = COST_LINE_TOOLTIPS[line.key];

    return (
        <div className={`grid grid-cols-[1fr_auto] items-center gap-6 px-8  py-2.5 rounded-lg border-[#F0F0F0] last:border-0 -mx-4 px-4 transition-colors ${isEdited ? "bg-[#ffc400]/47 border-l-[3px] border-l-[#FFC843]" : ""}`}>
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
                {tooltip && <InfoTooltip text={tooltip} />}
                {COST_DEBUG_ENABLED && (
                    <DebugFormulaTooltip
                        pending={debugPending && !debugExplanation}
                        text={
                            debugExplanation
                            ?? (debugPending
                                ? "Loading backend calculation formula…"
                                : "Formula unavailable. Use Recalculate to refresh.")
                        }
                    />
                )}
            </div>

            <div className="flex items-center gap-3">
                {!isFlat && (
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">{line.unit}</span>
                        {isReadonlyQty ? (
                            <span className="w-[68px] px-2 py-1 text-xs font-semibold text-[#000005] text-right">
                                {line.qty}
                            </span>
                        ) : (
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={parseFloat(line.qty.toFixed(2))}
                                onChange={(e) => onChange(line.key, "qty", parseFloat(e.target.value) || 0)}
                                className="border border-[#E0E0E0] rounded-sm px-2 py-1 text-xs text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] focus:bg-white w-[68px] text-right transition-colors font-semibold"
                            />
                        )}
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
                        value={parseFloat(line.unitCost.toFixed(2))}
                        onChange={(e) => onChange(line.key, "unitCost", parseFloat(e.target.value) || 0)}
                        className="border border-[#E0E0E0] rounded-sm px-2 py-1 text-xs text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] focus:bg-white w-[96px] text-right transition-colors font-semibold"
                    />
                </div>

                <div className="flex flex-col items-end gap-0.5 w-[80px]">
                    <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">total</span>
                    <span className="text-xs font-black text-[#000005]">${fmt(total)}</span>
                </div>
            </div>
        </div>
    );
}

const quoteSidebarPrimaryButtonClass =
    "text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200";

/** Post–Continue shell: narrow left rail + blank main (no scenario list until a quote is built). */
export function QuoteBreakdownLayoutPlaceholder({
    onBack,
    onBuildNewQuote,
}: {
    onBack: () => void;
    /** Hook for opening the build-quote flow; optional until wired. */
    onBuildNewQuote?: () => void;
}) {
    return (
        <div className="grid grid-cols-[220px_1fr] w-full flex-1 min-h-0 overflow-hidden text-[#000005]">
            <aside className="flex flex-col bg-white border-r-2 border-[#E0E0E0] px-3 py-5 gap-3 min-h-0 h-full">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#000005]">
                    <span className="text-[#FFC843]">// </span>QUOTES
                </div>
                <button
                    type="button"
                    onClick={() => onBuildNewQuote?.()}
                    className={quoteSidebarPrimaryButtonClass}
                >
                    + BUILD NEW QUOTE
                </button>
                <div className="flex-1 min-h-0 min-w-0" aria-hidden />

                <button
                    type="button"
                    onClick={onBack}
                    className="shrink-0 w-full text-xs font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-2 rounded-sm cursor-pointer hover:bg-[#000005] hover:text-white hover:border-[#000005] transition-all duration-200 uppercase tracking-widest"
                >
                    ← BACK
                </button>
            </aside>

            <div className="flex-1 min-w-0 min-h-0 bg-[#F8F8F8]" aria-hidden />
        </div>
    );
}

export default function QuoteBreakdown({
    quoteData,
    numStandees: initialStandees,
    requestPayload,
    initialActiveScenario,
    quoteName,
    initialContributionMargin = null,
    persistedQuoteId = null,
    quoteOwner = null,
    onBack,
    onNumStandeesChange,
}: Props) {
    const [activeScenario, setActiveScenario] = useState<ScenarioId>(() =>
        resolveInitialActiveScenario(quoteData, initialActiveScenario),
    );
    const [isRecalculating, setIsRecalculating] = useState(false);

    const initialSources: Record<ScenarioId, Record<string, unknown>> = {
        1: (quoteData["scenario_1"] as Record<string, unknown>) ?? {},
        2: (quoteData["scenario_2"] as Record<string, unknown>) ?? {},
        3: (quoteData["scenario_3"] as Record<string, unknown>) ?? {},
        4: (quoteData["scenario_4"] as Record<string, unknown>) ?? {},
        5: (quoteData["scenario_5"] as Record<string, unknown>) ?? {},
    };

    const builtInitial = buildScenarioState(
        initialSources as Record<ScenarioId, Record<string, number>>,
        initialStandees,
        resolveInitialActiveScenario(quoteData, initialActiveScenario),
    );
    const persistedBreakdownUi = breakdownUiFromQuoteData(quoteData);
    const initialLineState = applyCostLineOverrides(
        builtInitial.universalLines,
        builtInitial.scenarioLines,
        persistedBreakdownUi,
    );
    const [params, setParams] = useState<ScenarioParams>(() => builtInitial.params);
    const [baseline, setBaseline] = useState<ScenarioParams>(() => builtInitial.params);
    // Once the user edits the overs field, keep sending it on every recalc so it doesn't
    // get overwritten by the backend's num_standees-derived default.
    const [oversPinned, setOversPinned] = useState(false);
    const [universalLines, setUniversalLines] = useState<CostLine[]>(() => initialLineState.universalLines);
    const [universalSubtotalOverride, setUniversalSubtotalOverride] = useState<string>(
        () => universalSubtotalOverrideFromUi(persistedBreakdownUi),
    );
    const [scenarioLines, setScenarioLines] = useState<Record<ScenarioId, CostLine[]>>(
        () => initialLineState.scenarioLines,
    );
    const [scenarioSubtotalOverride, setScenarioSubtotalOverride] = useState<Record<ScenarioId, string>>(() =>
        scenarioSubtotalOverridesFromUi(persistedBreakdownUi),
    );
    const [debugExplanations, setDebugExplanations] = useState<Record<ScenarioId, CostDebugExplanations>>(() =>
        extractDebugExplanations(initialSources),
    );
    const [debugExplanationsLoading, setDebugExplanationsLoading] = useState(false);
    const [debugExplanationsError, setDebugExplanationsError] = useState<string | null>(null);
    const [isSavingQuote, setIsSavingQuote] = useState(false);
    const [saveQuoteError, setSaveQuoteError] = useState<string | null>(null);
    const [recalculateError, setRecalculateError] = useState<string | null>(null);
    const [universalCostsExpanded, setUniversalCostsExpanded] = useState(COST_DEBUG_ENABLED);
    const [scenarioCostsExpanded, setScenarioCostsExpanded] = useState(COST_DEBUG_ENABLED);
    const [manualDirty, setManualDirty] = useState(false);
    const [editedUniversalKeys, setEditedUniversalKeys] = useState<Set<string>>(new Set());
    const [editedScenarioKeys, setEditedScenarioKeys] = useState<Record<ScenarioId, Set<string>>>({ 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() });
    const origUniversalLines = useRef<CostLine[]>(initialLineState.universalLines);
    const origScenarioLines  = useRef<Record<ScenarioId, CostLine[]>>(initialLineState.scenarioLines);
    const [contributionMargin, setContributionMargin] = useState(() =>
        initialContributionMargin != null ? String(initialContributionMargin) : "",
    );

    // ── Save toast (mirrors the estimator-form toast pattern) ──────────────
    const [toast, setToast] = useState<{ message: string; type: "save" | "delete" } | null>(null);
    const [toastVisible, setToastVisible] = useState(false);

    useEffect(() => {
        if (toast) {
            const showId   = setTimeout(() => setToastVisible(true), 20);
            const hideId   = setTimeout(() => setToastVisible(false), 2500);
            const removeId = setTimeout(() => setToast(null), 2800);
            return () => { clearTimeout(showId); clearTimeout(hideId); clearTimeout(removeId); };
        }
    }, [toast]);

    // Saved quotes don't store _debug_explanations — fetch from backend on load.
    useEffect(() => {
        if (!COST_DEBUG_ENABLED) return;

        const scenarioIds = ([1, 2, 3, 4, 5] as ScenarioId[]).filter(
            (id) => quoteData[`scenario_${id}`] !== undefined,
        );
        if (scenarioIds.length === 0) return;
        if (hasDebugExplanations(debugExplanations, scenarioIds)) return;

        let cancelled = false;
        setDebugExplanationsLoading(true);
        setDebugExplanationsError(null);

        (async () => {
            try {
                const res = await fetch(`${API_BASE}/generate_quote`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...requestPayload,
                        persist_project: false,
                        num_standees: params.numStandees,
                        print_forms_per_standee: params.printFormsPerStandee,
                        structure_forms_per_standee: params.structureFormsPerStandee,
                        num_overs: params.overs,
                    }),
                });
                const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
                if (cancelled) return;
                if (!res.ok || !data) {
                    setDebugExplanationsError("Could not load debug formulas from backend.");
                    return;
                }
                setDebugExplanations((prev) => ({ ...prev, ...debugExplanationsFromQuoteResponse(data) }));
            } catch {
                if (!cancelled) setDebugExplanationsError("Could not load debug formulas from backend.");
            } finally {
                if (!cancelled) setDebugExplanationsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // Intentionally only on quote open — recalculate updates explanations separately.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persistedQuoteId, quoteData]);

    function showToast(message: string, type: "save" | "delete") {
        setToastVisible(false);
        setToast(null);
        setTimeout(() => setToast({ message, type }), 10);
    }

    const { numStandees, printFormsPerStandee, structureFormsPerStandee, overs } = params;

    const isDirty =
        numStandees !== baseline.numStandees ||
        printFormsPerStandee !== baseline.printFormsPerStandee ||
        structureFormsPerStandee !== baseline.structureFormsPerStandee ||
        overs !== baseline.overs;

    const canPersistQuote = Boolean(persistedQuoteId?.trim() && quoteOwner?.trim());
    const needsSave = canPersistQuote && (isDirty || manualDirty);

    async function persistQuoteSnapshots(
        sharedParams: ScenarioParams,
        ul: CostLine[],
        uso: string,
        sl: Record<ScenarioId, CostLine[]>,
        sso: Record<ScenarioId, string>,
    ): Promise<boolean> {
        const qid = persistedQuoteId?.trim();
        const owner = quoteOwner?.trim();
        if (!qid || !owner) return false;
        const breakdown: Record<string, unknown> = {};
        for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
            if (quoteData[`scenario_${id}`] === undefined) continue;
            breakdown[`scenario_${id}`] = serializeScenarioToSource(id, sharedParams, ul, sl, initialSources);
        }
        const ui = buildBreakdownUiPayloadFromState(ul, uso, sl, sso);
        if (ui) breakdown._breakdown_ui = ui;
        const parsedMargin = parseFloat(contributionMargin);
        const contribution_margin =
            Number.isFinite(parsedMargin) && parsedMargin >= 0 && parsedMargin < 100 ? parsedMargin : 0;
        const body = {
            quote_name: (quoteName ?? "").trim() || "Untitled quote",
            num_standees: sharedParams.numStandees,
            contribution_margin,
            scenario: activeScenario,
            standee_type: standeeTypeToPersistLabel(requestPayload.standee_type),
            elements: requestPayload.elements.map((e) => ({
                name: e.name ?? "",
                length: e.height,
                width: e.width,
                linear_inches: e.linear_inches,
                complexity: e.complexity,
            })),
            breakdown,
        };
        const res = await fetch(`${API_BASE}/quotes/${encodeURIComponent(qid)}?owner=${encodeURIComponent(owner)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const errBody = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error("PATCH quote:", errBody);
            return false;
        }
        return true;
    }

    async function handleSaveQuoteToDb() {
        if (!canPersistQuote) return;
        setIsSavingQuote(true);
        setSaveQuoteError(null);
        try {
            const ok = await persistQuoteSnapshots(
                params,
                universalLines,
                universalSubtotalOverride,
                scenarioLines,
                scenarioSubtotalOverride,
            );
            if (ok) {
                setBaseline({ ...params });
                setManualDirty(false);
                showToast("Quote saved", "save");
            } else {
                setSaveQuoteError("Could not save quote");
            }
        } catch {
            setSaveQuoteError("Could not save quote");
        } finally {
            setIsSavingQuote(false);
        }
    }

    function patchParams(updates: Partial<ScenarioParams>) {
        setParams((prev) => ({ ...prev, ...updates }));
    }

    function updateUniversal(key: string, field: "qty" | "unitCost", value: number) {
        setManualDirty(true);
        setUniversalLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
        const orig = origUniversalLines.current.find((l) => l.key === key);
        const cur  = universalLines.find((l) => l.key === key);
        const next = cur ? { ...cur, [field]: value } : null;
        setEditedUniversalKeys((prev) => {
            const s = new Set(prev);
            if (orig && next && orig.qty === next.qty && orig.unitCost === next.unitCost) s.delete(key);
            else s.add(key);
            return s;
        });
    }

    function updateScenario(key: string, field: "qty" | "unitCost", value: number) {
        setManualDirty(true);
        setScenarioLines((prev) => ({
            ...prev,
            [activeScenario]: prev[activeScenario].map((l) => (l.key === key ? { ...l, [field]: value } : l)),
        }));
        const orig = origScenarioLines.current[activeScenario]?.find((l) => l.key === key);
        const cur  = scenarioLines[activeScenario]?.find((l) => l.key === key);
        const next = cur ? { ...cur, [field]: value } : null;
        setEditedScenarioKeys((prev) => {
            const s = new Set(prev[activeScenario]);
            if (orig && next && orig.qty === next.qty && orig.unitCost === next.unitCost) s.delete(key);
            else s.add(key);
            return { ...prev, [activeScenario]: s };
        });
    }

    async function recalculate() {
        setIsRecalculating(true);
        setSaveQuoteError(null);
        setRecalculateError(null);
        const body = {
            ...requestPayload,
            // no scenario → backend returns all 5 at once
            num_standees: params.numStandees,
            persist_project: false,
            print_forms_per_standee: params.printFormsPerStandee,
            structure_forms_per_standee: params.structureFormsPerStandee,
            ...(oversPinned && { num_overs: params.overs }),
        };
        try {
            const res = await fetch(`${API_BASE}/generate_quote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const detail =
                    data && typeof data === "object" && "detail" in data
                        ? String((data as { detail: unknown }).detail)
                        : `HTTP ${res.status}`;
                setRecalculateError(`Recalculate failed: ${detail}`);
                return;
            }
            // Universal lines are the same across all scenarios; seed from first available
            const firstSrc = ((data["scenario_1"] ?? data["scenario_2"] ?? {}) as Record<string, number>);
            const newUniversalLines = seedLines(
                buildLines(Object.keys(UNIVERSAL_LINE_DEFS), UNIVERSAL_LINE_DEFS),
                firstSrc,
            );
            const newSl = { ...scenarioLines } as Record<ScenarioId, CostLine[]>;
            const newDebug = { ...debugExplanations } as Record<ScenarioId, CostDebugExplanations>;
            for (const sid of [1, 2, 3, 4, 5] as ScenarioId[]) {
                const src = (data[`scenario_${sid}`] ?? {}) as Record<string, number>;
                if (data[`scenario_${sid}`]) {
                    newSl[sid] = seedLines(buildLines(SCENARIO_KEYS[sid], SCENARIO_LINE_DEFS), src);
                    newDebug[sid] = extractDebugExplanations({ [sid]: src })[sid] ?? {};
                }
            }
            const newParams: ScenarioParams = { ...params, overs: firstSrc.overs ?? params.overs };
            const newSso: Record<ScenarioId, string> = { 1: "", 2: "", 3: "", 4: "", 5: "" };
            setUniversalLines(newUniversalLines);
            setUniversalSubtotalOverride("");
            setScenarioLines(newSl);
            setScenarioSubtotalOverride(newSso);
            setParams(newParams);
            setBaseline({ ...newParams });
            setDebugExplanations(newDebug);
            setManualDirty(false);
            setEditedUniversalKeys(new Set());
            setEditedScenarioKeys({ 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() });
            origUniversalLines.current = newUniversalLines;
            origScenarioLines.current  = newSl;
            if (canPersistQuote) {
                setIsSavingQuote(true);
                try {
                    const ok = await persistQuoteSnapshots(newParams, newUniversalLines, "", newSl, newSso);
                    if (!ok) setSaveQuoteError("Could not save quote after recalculate");
                } catch {
                    setSaveQuoteError("Could not save quote after recalculate");
                } finally {
                    setIsSavingQuote(false);
                }
            }
        } catch (err) {
            console.error("Recalculate error:", err);
            setRecalculateError("Recalculate failed — network error");
        } finally {
            setIsRecalculating(false);
        }
    }

    const universalLinesSum = universalLines.reduce((s, l) => s + lineTotal(l), 0);
    const scenarioLinesSum  = scenarioLines[activeScenario].reduce((s, l) => s + lineTotal(l), 0);
    const parsedUniversalOv = parseFloat(universalSubtotalOverride);
    const parsedScenarioOv  = parseFloat(scenarioSubtotalOverride[activeScenario]);
    const universalTotal =
        universalSubtotalOverride.trim() !== "" && Number.isFinite(parsedUniversalOv)
            ? parsedUniversalOv
            : universalLinesSum;
    const scenarioTotal =
        (scenarioSubtotalOverride[activeScenario] ?? "").trim() !== "" && Number.isFinite(parsedScenarioOv)
            ? parsedScenarioOv
            : scenarioLinesSum;
    const grandTotal = universalTotal + scenarioTotal;
    const costPerStandee = numStandees > 0 ? grandTotal / numStandees : null;

    const marginPctRaw = parseFloat(contributionMargin);
    const marginValid  = Number.isFinite(marginPctRaw) && marginPctRaw >= 0 && marginPctRaw < 100;
    const marginPct    = marginValid ? marginPctRaw : 0;
    const sellPrice    = marginPct > 0 ? grandTotal / (1 - marginPct / 100) : grandTotal;
    const marginDollars = sellPrice - grandTotal;
    const sellPerStandee = numStandees > 0 ? sellPrice / numStandees : null;

    const availableScenarios: ScenarioId[] = [1, 2, 3, 4, 5].filter(
        (id) => quoteData[`scenario_${id}`] !== undefined,
    ) as ScenarioId[];

    return (
        <div className="flex flex-row w-full flex-1 min-h-0 overflow-hidden text-[#000005]">
            {toast && (
                <div
                    className={`fixed top-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
                        toastVisible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
                    }`}
                >
                    <div className={`flex items-center gap-3 rounded-sm border-2 px-5 py-3 shadow-2xl ${
                        toast.type === "delete" ? "border-red-400 bg-[#000005]" : "border-[#FFC843] bg-[#000005]"
                    }`}>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                            toast.type === "delete" ? "text-red-400" : "text-[#FFC843]"
                        }`}>
                            {toast.type === "delete" ? "// DELETED" : "// SAVED"}
                        </span>
                        <span className="text-xs font-semibold text-white">{toast.message}</span>
                    </div>
                </div>
            )}

            {/* Left sidebar — scenario selector + back */}
            <aside className="flex flex-col w-[220px] shrink-0 bg-white border-r-2 border-[#E0E0E0] px-3 py-5 gap-4 min-h-0 h-full overflow-y-auto">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#000005] mb-1">
                        <span className="text-[#FFC843]">// </span>QUOTE
                    </div>
                    {quoteName?.trim() ? (
                        <div className="text-xs font-black text-[#000005] uppercase tracking-tight break-words leading-snug">
                            {quoteName.trim()}
                        </div>
                    ) : (
                        <div className="text-xs font-black text-[#000005] uppercase tracking-tight">
                            Quote Breakdown
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                    <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest shrink-0">Scenario</span>
                    <div className="flex flex-col gap-1.5">
                        {availableScenarios.map((id) => (
                            <div
                                key={id}
                                onClick={() => setActiveScenario(id)}
                                className={`text-left w-full cursor-pointer rounded-sm border-2 px-3 py-2.5 transition-all duration-200 ${
                                    activeScenario === id
                                        ? "border-[#000005] bg-[#000005]"
                                        : "border-[#E0E0E0] hover:border-[#B1B3B6] bg-white"
                                }`}
                            >
                                <span className={`block text-xs font-black uppercase tracking-wide ${activeScenario === id ? "text-white" : "text-[#000005]"}`}>
                                    {SCENARIO_META[id].short}
                                </span>
                                <span className={`block text-[10px] font-semibold ${activeScenario === id ? "text-[#FFC843]" : "text-[#B1B3B6]"}`}>
                                    {SCENARIO_META[id].sub}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onBack}
                    className="shrink-0 w-full text-xs font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-2.5 rounded-sm cursor-pointer hover:bg-[#000005] hover:text-white hover:border-[#000005] transition-all duration-200 uppercase tracking-widest"
                >
                    ← BACK
                </button>
            </aside>

            {/* Main panel */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#F8F8F8]">
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-8 py-6 gap-5">

                {/* Header */}
                <div className="shrink-0 flex flex-col gap-2">
                    <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase">// BREAKDOWN</div>
                    <div className="text-2xl sm:text-3xl font-black text-[#000005] uppercase tracking-tight">
                        Quote Breakdown
                    </div>
                    <p className="text-[1.75em] text-[#000005] font-semibold">
                        Scenario {activeScenario} — {SCENARIO_META[activeScenario].short}: {SCENARIO_META[activeScenario].sub}
                    </p>
                    {COST_DEBUG_ENABLED && (
                        <p className="text-[10px] font-bold text-[#F57F17] bg-[#FFF8E1] border border-[#FFE082] rounded-sm px-2 py-1">
                            Debug mode: hover the orange ? icons for backend calculation formulas.
                            {debugExplanationsLoading && " Loading formulas…"}
                            {debugExplanationsError && ` ${debugExplanationsError}`}
                        </p>
                    )}
                </div>

                {/* Parameters card */}
                <div className="shrink-0 flex items-center gap-6 bg-white border-2 border-[#E0E0E0] rounded-sm px-5 py-4 flex-wrap">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Number of Standees</span>
                        <input
                            type="number"
                            min={0}
                            value={numStandees}
                            onChange={(e) => {
                                const n = parseInt(e.target.value) || 0;
                                setOversPinned(false);
                                patchParams({ numStandees: n });
                                onNumStandeesChange?.(n);
                            }}
                            disabled={isRecalculating}
                            className={`border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none focus:border-[#FFC843] w-[140px] text-right transition-colors disabled:opacity-50 ${numStandees !== baseline.numStandees ? "bg-[#FFC843]/20" : "bg-[#F8F8F8]"}`}
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
                            onChange={(e) => patchParams({ printFormsPerStandee: Math.max(1, parseInt(e.target.value) || 1) })}
                            disabled={isRecalculating}
                            className={`border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none focus:border-[#FFC843] w-[100px] text-right transition-colors disabled:opacity-50 ${printFormsPerStandee !== baseline.printFormsPerStandee ? "bg-[#FFC843]/20" : "bg-[#F8F8F8]"}`}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Structure Forms / Standee</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={structureFormsPerStandee}
                            onChange={(e) => patchParams({ structureFormsPerStandee: Math.max(0, parseInt(e.target.value) || 0) })}
                            disabled={isRecalculating}
                            className={`border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none focus:border-[#FFC843] w-[100px] text-right transition-colors disabled:opacity-50 ${structureFormsPerStandee !== baseline.structureFormsPerStandee ? "bg-[#FFC843]/20" : "bg-[#F8F8F8]"}`}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Blank Forms / Standee</span>
                        <span className="text-sm font-black text-[#000005] text-right py-1.5">
                            {printFormsPerStandee + structureFormsPerStandee}
                        </span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Overs / Standee</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={overs}
                            onChange={(e) => {
                                setOversPinned(true);
                                patchParams({ overs: Math.max(0, parseInt(e.target.value) || 0) });
                            }}
                            disabled={isRecalculating}
                            className={`border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none focus:border-[#FFC843] w-[100px] text-right transition-colors disabled:opacity-50 ${overs !== baseline.overs ? "bg-[#FFC843]/20" : "bg-[#F8F8F8]"}`}
                        />
                    </div>
                    <div className="h-10 w-px bg-[#E0E0E0]" />
                    <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={recalculate}
                                disabled={isRecalculating || !isDirty}
                                className="text-xs font-black uppercase tracking-widest px-4 py-2 rounded-sm bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {isRecalculating ? "Recalculating…" : "↻ Recalculate"}
                            </button>
                            {needsSave && (
                                <button
                                    type="button"
                                    disabled={isSavingQuote || isRecalculating}
                                    onClick={() => void handleSaveQuoteToDb()}
                                    className="text-xs font-black uppercase tracking-widest px-4 py-2 rounded-sm border-2 border-[#000005] bg-white text-[#000005] hover:bg-[#000005] hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {isSavingQuote ? "Saving…" : "↑ Save"}
                                </button>
                            )}
                        </div>
                        {(recalculateError || saveQuoteError) && (
                            <span className="text-[10px] text-red-600 font-semibold leading-snug">
                                {recalculateError ?? saveQuoteError}
                            </span>
                        )}
                    </div>
                </div>

                {/* Scrollable cost sections */}
                <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto gap-4 transition-opacity duration-200 ${isRecalculating ? "opacity-40 pointer-events-none" : ""}`}>

                    {/* Universal costs */}
                    <div className="group border-2 border-[#E0E0E0] rounded-sm bg-white p-4">
                        <div
                            className="w-full flex items-center justify-between gap-3 cursor-pointer"
                            onClick={() => setUniversalCostsExpanded((v) => !v)}
                        >
                            <span className="text-[10px] font-black text-[#000005] uppercase tracking-widest">
                                <span className="text-[#FFC843]">// </span>Universal Costs
                            </span>
                            <span className="flex items-center gap-3 shrink-0">
                                <span className="text-sm font-black text-[#000005] tabular-nums">
                                    ${fmt(universalTotal)}
                                    {universalSubtotalOverride.trim() !== "" && Number.isFinite(parsedUniversalOv) && (
                                        <span className="text-[10px] font-bold text-[#F57F17] ml-1">override</span>
                                    )}
                                </span>
                                <span
                                    className={`text-[#000005] group-hover:text-[#FFC843] transition-all duration-300 select-none ${universalCostsExpanded ? "rotate-180" : "rotate-0"}`}
                                    aria-hidden
                                >
                                    ▾
                                </span>
                            </span>
                        </div>
                        <div className={`grid transition-all duration-300 ease-in-out ${universalCostsExpanded ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                                {universalLines.map((line) => (
                                    <CostRow
                                        key={line.key}
                                        line={line}
                                        onChange={updateUniversal}
                                        debugExplanation={debugExplanations[activeScenario]?.[line.key]}
                                        debugPending={debugExplanationsLoading}
                                        isEdited={editedUniversalKeys.has(line.key)}
                                    />
                                ))}
                                <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-[#F0F0F0]">
                                    <span className="text-xs font-black text-[#B1B3B6] uppercase tracking-wider">Subtotal</span>
                                    <span className="text-sm font-black text-[#000005]">${fmt(universalLinesSum)}</span>
                                </div>
                                <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
                                    <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                                        <span className="text-[9px] font-black text-[#B1B3B6] uppercase tracking-widest">
                                            Override universal subtotal ($)
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={universalSubtotalOverride}
                                            onChange={(e) => { setManualDirty(true); setUniversalSubtotalOverride(e.target.value); }}
                                            placeholder={`e.g. 5000 — default ${fmt(universalLinesSum)}`}
                                            className="border border-[#E0E0E0] rounded-sm px-2 py-1.5 text-xs text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] w-full font-semibold"
                                        />
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 pb-0.5">
                                        <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">Used in total</span>
                                        <span className="text-sm font-black text-[#000005]">${fmt(universalTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Scenario costs */}
                    <div className="group border-2 border-[#E0E0E0] rounded-sm bg-white p-4">
                        <div
                            className="w-full flex items-center justify-between gap-3 cursor-pointer"
                            onClick={() => setScenarioCostsExpanded((v) => !v)}
                        >
                            <span className="text-[10px] font-black text-[#000005] uppercase tracking-widest">
                                <span className="text-[#FFC843]">// </span>Scenario {activeScenario} Costs
                            </span>
                            <span className="flex items-center gap-3 shrink-0">
                                <span className="text-sm font-black text-[#000005] tabular-nums">
                                    ${fmt(scenarioTotal)}
                                    {(scenarioSubtotalOverride[activeScenario] ?? "").trim() !== "" && Number.isFinite(parsedScenarioOv) && (
                                        <span className="text-[10px] font-bold text-[#F57F17] ml-1">override</span>
                                    )}
                                </span>
                                <span
                                    className={`text-[#000005] group-hover:text-[#FFC843] transition-all duration-300 select-none ${scenarioCostsExpanded ? "rotate-180" : "rotate-0"}`}
                                    aria-hidden
                                >
                                    ▾
                                </span>
                            </span>
                        </div>
                        <div className={`grid transition-all duration-300 ease-in-out ${scenarioCostsExpanded ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                                {scenarioLines[activeScenario].map((line) => (
                                    <CostRow
                                        key={line.key}
                                        line={line}
                                        onChange={updateScenario}
                                        debugExplanation={debugExplanations[activeScenario]?.[line.key]}
                                        debugPending={debugExplanationsLoading}
                                        isEdited={editedScenarioKeys[activeScenario]?.has(line.key)}
                                    />
                                ))}
                                <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-[#F0F0F0]">
                                    <span className="text-xs font-black text-[#B1B3B6] uppercase tracking-wider">Subtotal</span>
                                    <span className="text-sm font-black text-[#000005]">${fmt(scenarioLinesSum)}</span>
                                </div>
                                <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
                                    <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                                        <span className="text-[9px] font-black text-[#B1B3B6] uppercase tracking-widest">
                                            Override scenario subtotal ($)
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={scenarioSubtotalOverride[activeScenario]}
                                            onChange={(e) => {
                                                setManualDirty(true);
                                                setScenarioSubtotalOverride((prev) => ({
                                                    ...prev,
                                                    [activeScenario]: e.target.value,
                                                }));
                                            }}
                                            placeholder={`default ${fmt(scenarioLinesSum)}`}
                                            className="border border-[#E0E0E0] rounded-sm px-2 py-1.5 text-xs text-[#000005] outline-none bg-[#F8F8F8] focus:border-[#FFC843] w-full font-semibold"
                                        />
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 pb-0.5">
                                        <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">Used in total</span>
                                        <span className="text-sm font-black text-[#000005]">${fmt(scenarioTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Grand total + contribution margin */}
                    <div className="shrink-0 sticky bottom-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 bg-[#000005] text-white rounded-sm px-5 py-4">                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Contribution Margin</span>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min={0}
                                    max={99.99}
                                    step={0.5}
                                    value={contributionMargin}
                                    onChange={(e) => {
                                        setManualDirty(true);
                                        setContributionMargin(e.target.value);
                                    }}
                                    placeholder="0"
                                    className="border-2 border-[#2A2A30] rounded-sm px-2 py-1 text-sm font-black text-white bg-[#15151A] outline-none focus:border-[#FFC843] w-[90px] text-right transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <span className="text-sm font-black text-[#FFC843]">%</span>
                            </div>
                            <span className="text-[10px] font-bold text-[#B1B3B6] uppercase tracking-widest">
                                {marginPct > 0 ? `Margin $${fmt(marginDollars)}` : "Markup on cost"}
                            </span>
                        </div>

                        <div className="h-12 w-px bg-[#2A2A30]" />

                        {/* Total estimated cost */}
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-black uppercase tracking-widest">Total Cost</span>
                                {costPerStandee !== null && (
                                    <span className="text-[10px] font-bold text-[#B1B3B6] uppercase tracking-widest">
                                        Per standee ({numStandees})
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xl font-black text-white tabular-nums">${fmt(grandTotal)}</span>
                                {costPerStandee !== null && (
                                    <span className="text-xs font-black text-[#B1B3B6] tabular-nums">${fmt(costPerStandee)}</span>
                                )}
                            </div>
                        </div>

                        <div className="h-12 w-px bg-[#2A2A30]" />

                        {/* Sell price after contribution margin */}
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-black uppercase tracking-widest text-[#FFC843]">Sell Price</span>
                                {sellPerStandee !== null && (
                                    <span className="text-[10px] font-bold text-[#B1B3B6] uppercase tracking-widest">
                                        Per standee ({numStandees})
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                <span className="text-2xl font-black text-[#FFC843] tabular-nums">${fmt(sellPrice)}</span>
                                {sellPerStandee !== null && (
                                    <span className="text-xs font-black text-white tabular-nums">${fmt(sellPerStandee)}</span>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            </div>
        </div>
    );
}
