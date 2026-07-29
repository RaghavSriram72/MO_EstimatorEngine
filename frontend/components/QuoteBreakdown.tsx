"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    type QuoteData,
    type QuoteBreakdownUi,
    type RequestPayload,
    type PersistedQuoteState,
    type PersistedScenarioChild,
    type PersistedLineEdit,
    type PersistedSpecParams,
} from "@/pages/Inputter";
import { API_BASE } from "@/lib/config";
import { COST_LINE_TOOLTIPS } from "@/lib/costLineTooltips";
import { COST_DEBUG_ENABLED, extractDebugExplanations, debugExplanationsFromQuoteResponse, hasDebugExplanations, type CostDebugExplanations } from "@/lib/costDebugConfig";

export type ScenarioId = 1 | 2 | 3 | 4 | 5;

export type CostLine = {
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
    /** Saved quote state (five scenario children) used to rehydrate edits + defaults. */
    persistedState?: PersistedQuoteState | null;
    quoteOwner?: string | null;
    onBack: () => void;
    /** Keeps parent sidebar / payload in sync when standee count is edited. */
    onNumStandeesChange?: (numStandees: number) => void;
    /** True when saved engine defaults are behind the current data-collector cost tables. */
    costsStale?: boolean;
    /** Fires after a successful recalculate with a new standee count, so the
     * parent can persist it back to the project. */
    onNumStandeesCommitted?: (numStandees: number) => void;
    /** Fires after engine defaults are recalculated and saved (clears stale cost highlight). */
    onCostsSynced?: () => void;
};

function resolveInitialActiveScenario(quoteData: QuoteData, hint?: ScenarioId): ScenarioId {
    if (hint !== undefined && quoteData[`scenario_${hint}`] !== undefined) {
        return hint;
    }
    // Scenario 2 disabled — no longer offered as a selectable tab. Tabs now go 1, 3, 4, 5.
    const first = [1, 3, 4, 5].find((id) => quoteData[`scenario_${id}`] !== undefined);
    return (first as ScenarioId) ?? 1;
}

// Scenario 2 ("Internal / Assembled") is disabled — no longer offered as a tab (see
// `availableScenarios`/`resolveInitialActiveScenario` below). Its entries below stay in
// place only because `ScenarioId`/`Record<ScenarioId, …>` still cover 1–5 for older saved
// quotes that carry a scenario_2 blob — they're unreachable from the UI otherwise.
const SCENARIO_META: Record<ScenarioId, { short: string; sub: string }> = {
    1: { short: "Internal",  sub: "Packed Out" },
    2: { short: "Internal",  sub: "Assembled" },
    3: { short: "Hybrid",    sub: "External Assembly" },
    4: { short: "Hybrid",    sub: "External Mount/Die Cut/Assembly" },
    5: { short: "External",  sub: "Full Outsource" },
};

// With scenario 2 gone, the remaining scenarios are renumbered for display so they read as
// a consecutive 1, 2, 3, 4 instead of 1, 3, 4, 5. The underlying ids (ScenarioId, quoteData
// keys like "scenario_3", persisted `scenario` fields, etc.) are untouched — this ONLY
// changes what number is shown to the user. Unmapped ids (e.g. a legacy "2" surfacing from
// old history data) fall back to their raw id rather than colliding with the new "2" label.
const SCENARIO_DISPLAY_NUMBER: Partial<Record<number, number>> = { 1: 1, 3: 2, 4: 3, 5: 4 };
export function displayScenarioNumber(id: number): number {
    return SCENARIO_DISPLAY_NUMBER[id] ?? id;
}

export type LineDef = { label: string; unit: string; readonlyQty?: boolean };

export const UNIVERSAL_LINE_DEFS: Record<string, LineDef> = {
    imposition_cost:         { label: "Imposition Labor",     unit: "hrs"      },
    blank_comp_cost:         { label: "Blank Comp",           unit: "units"    },
    color_comp_cost:         { label: "Color Comp",           unit: "units"    },
    engineering_design_cost: { label: "Engineering & Design", unit: "flat"     },
    hardware_cost:           { label: "Hardware",             unit: "standees" },
};

export const SCENARIO_LINE_DEFS: Record<string, LineDef> = {
    corrugate_cost:         { label: "Corrugate",            unit: "forms",    readonlyQty: true },
    print_form_cost:        { label: "Print Form Material",  unit: "forms",    readonlyQty: true },
    print_cost:             { label: "Rho Print",            unit: "hrs",      readonlyQty: true },
    rollx_cost:             { label: "Roll-X",               unit: "hrs",      readonlyQty: true },
    zund_cut_cost:          { label: "Zund Cutting",          unit: "hrs",     readonlyQty: true },
    die_cost:               { label: "Die Cost",             unit: "dies"     },
    pallet_material_cost:   { label: "Pallets",              unit: "pallets"  },
    pallet_labor_cost:      { label: "Pallet Labor",         unit: "pallets"  },
    shipping_box_cost:      { label: "Shipping Box",         unit: "standees" },
    label_cost:             { label: "Labels",               unit: "standees" },
    instruction_sheet_cost: { label: "Instruction Sheet",    unit: "standees" },
    freight_cost:               { label: "Freight Cost",            unit: "flat"     },
    kitting_and_assembly_cost:  { label: "Kitting & Assembly",      unit: "standees" },
    packout:                    { label: "Kitting and Assembly",    unit: "standees" },
    litho_buyout_cost:          { label: "Litho Print Buyout",       unit: "sheets",   readonlyQty: true },
    mount_die_buyout_cost:      { label: "Mount & Die Cut Buyout",        unit: "standees", readonlyQty: true },
};

// Scenario 2 entry kept only for `Record<ScenarioId, …>` completeness / older saved quotes —
// see the note above `SCENARIO_META`. It's never a selectable tab.
export const SCENARIO_KEYS: Record<ScenarioId, string[]> = {
    1: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "kitting_and_assembly_cost"],
    2: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "kitting_and_assembly_cost"],
    3: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "packout"],
    4: ["print_form_cost", "print_cost", "mount_die_buyout_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "die_cost", "packout"],
    5: ["litho_buyout_cost", "mount_die_buyout_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "die_cost", "packout"],
};

// Manual edits to a cost row propagate to every scenario that shares the same
// line key, keeping specs consistent across scenarios. Each group lists all
// scenarios containing that key (see SCENARIO_KEYS). Engine-computed defaults
// stay per-scenario — only user edits are synced.
const SCENARIO_SYNC_GROUPS: Partial<Record<string, ScenarioId[]>> = {
    corrugate_cost:            [1, 2, 3],
    print_form_cost:           [1, 2, 3, 4],
    print_cost:                [1, 2, 3, 4],
    rollx_cost:                [1, 2, 3],
    zund_cut_cost:             [1, 2, 3],
    shipping_box_cost:         [1, 2, 3, 4, 5],
    label_cost:                [1, 2, 3, 4, 5],
    kitting_and_assembly_cost: [1, 2],
    instruction_sheet_cost:    [1, 2, 3, 4, 5],
    pallet_material_cost:      [3, 4, 5],
    pallet_labor_cost:         [3, 4, 5],
    freight_cost:              [3, 4, 5],
    mount_die_buyout_cost:     [4, 5],
    die_cost:                  [4, 5],
    packout:                   [3, 4, 5],
    // litho_buyout_cost only exists in scenario 5 — nothing to sync.
};


export function lineTotal(l: CostLine) {
    if (l.rawTotal !== undefined) return l.rawTotal;
    return l.unit === "flat" ? l.unitCost : l.qty * l.unitCost;
}

export function fmt(value: number): string {
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
        printFormsPerStandee: Math.ceil(seedSource.print_forms_per_standee ?? 1),
        structureFormsPerStandee: Math.ceil(seedSource.structure_forms_per_standee ?? 0),
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

// ── Persisted quote (v2) helpers — quote object with five scenario children ─

/** Keeps only finite numbers — strips _debug_explanations etc. before storing in Mongo. */
function numericOnly(blob: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(blob)) {
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
}

/** Re-applies saved manual edits on top of default-seeded lines.
 * rawTotal is dropped on edited rows so totals recompute as qty × unitCost,
 * matching live editing behavior. */
function applyPersistedEdits(
    lines: CostLine[],
    edits: Record<string, PersistedLineEdit> | undefined,
): CostLine[] {
    if (!edits) return lines;
    return lines.map((l) => {
        const e = edits[l.key];
        return e ? { ...l, qty: e.qty, unitCost: e.unit_cost, rawTotal: undefined } : l;
    });
}

/** Collects only the manually edited rows into the persisted line_edits shape. */
function lineEditsFor(lines: CostLine[], editedKeys: Set<string>): Record<string, PersistedLineEdit> {
    const out: Record<string, PersistedLineEdit> = {};
    for (const line of lines) {
        if (editedKeys.has(line.key)) out[line.key] = { qty: line.qty, unit_cost: line.unitCost };
    }
    return out;
}

function toSpecParams(p: ScenarioParams): PersistedSpecParams {
    return {
        num_standees: p.numStandees,
        print_forms_per_standee: p.printFormsPerStandee,
        structure_forms_per_standee: p.structureFormsPerStandee,
        overs: p.overs,
    };
}

function fromSpecParams(p: PersistedSpecParams): ScenarioParams {
    return {
        numStandees: p.num_standees,
        printFormsPerStandee: Math.ceil(p.print_forms_per_standee),
        structureFormsPerStandee: Math.ceil(p.structure_forms_per_standee),
        overs: p.overs,
    };
}

/** Everything needed to write one full persisted-quote snapshot. */
type QuoteSnapshot = {
    params: ScenarioParams;
    paramDefaults: ScenarioParams;
    universalLines: CostLine[];
    universalEdited: Set<string>;
    universalSubtotalOverride: string;
    scenarioLines: Record<ScenarioId, CostLine[]>;
    scenarioEdited: Record<ScenarioId, Set<string>>;
    scenarioSubtotalOverride: Record<ScenarioId, string>;
    /** Latest raw backend blobs per scenario (the stored "defaults"). */
    sources: Record<ScenarioId, Record<string, unknown>>;
    /** Set when engine defaults were freshly generated (clears stale cost highlight). */
    costTablesVersion?: string;
};

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
    origLine,
}: {
    line: CostLine;
    onChange: (key: string, field: "qty" | "unitCost", value: number) => void;
    debugExplanation?: string;
    debugPending?: boolean;
    isEdited?: boolean;
    origLine?: { qty: number; unitCost: number; rawTotal?: number };
}) {
    const isFlat        = line.unit === "flat";
    const isStandees    = line.unit === "standees";
    const isReadonlyQty = isStandees || !!line.readonlyQty;
    const total         = lineTotal(line);
    const tooltip       = COST_LINE_TOOLTIPS[line.key];

    const qtyChanged      = isEdited && origLine != null && Math.abs(origLine.qty - line.qty) > 0.00005;
    const unitCostChanged = isEdited && origLine != null && Math.abs(origLine.unitCost - line.unitCost) > 0.00005;
    const origTotal       =
        origLine != null
            ? origLine.rawTotal ?? (isFlat ? origLine.unitCost : origLine.qty * origLine.unitCost)
            : null;

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
                                {parseFloat(line.qty.toFixed(2))}
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
                        {qtyChanged && origLine && (
                            <span className="text-[9px] text-red-600 font-semibold">
                                previous: {parseFloat(origLine.qty.toFixed(2))}
                            </span>
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
                    {unitCostChanged && origLine && (
                        <span className="text-[9px] text-red-600 font-semibold">
                            previous: ${parseFloat(origLine.unitCost.toFixed(2))}
                        </span>
                    )}
                </div>

                <div className="flex flex-col items-end gap-0.5 w-[80px]">
                    <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">total</span>
                    <span className="text-xs font-black text-[#000005]">${fmt(total)}</span>
                    {isEdited && origTotal != null && Math.abs(origTotal - total) > 0.005 && (
                        <span className="text-[9px] text-red-600 font-semibold">
                            previous: ${fmt(origTotal)}
                        </span>
                    )}
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
    persistedState = null,
    quoteOwner = null,
    costsStale = false,
    onBack,
    onNumStandeesChange,
    onNumStandeesCommitted,
    onCostsSynced,
}: Props) {
    const [activeScenario, setActiveScenario] = useState<ScenarioId>(() =>
        resolveInitialActiveScenario(quoteData, initialActiveScenario),
    );
    const [isRecalculating, setIsRecalculating] = useState(false);

    const persistedChild = (id: ScenarioId): PersistedScenarioChild | undefined =>
        persistedState?.scenarios?.[String(id)];

    // Saved defaults (engine outputs before edits) win over the raw quoteData blobs.
    const initialSources: Record<ScenarioId, Record<string, unknown>> = {
        1: persistedChild(1)?.defaults ?? (quoteData["scenario_1"] as Record<string, unknown>) ?? {},
        2: persistedChild(2)?.defaults ?? (quoteData["scenario_2"] as Record<string, unknown>) ?? {},
        3: persistedChild(3)?.defaults ?? (quoteData["scenario_3"] as Record<string, unknown>) ?? {},
        4: persistedChild(4)?.defaults ?? (quoteData["scenario_4"] as Record<string, unknown>) ?? {},
        5: persistedChild(5)?.defaults ?? (quoteData["scenario_5"] as Record<string, unknown>) ?? {},
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
    // Re-apply saved manual edits (v2 quote shape) on top of the default-seeded lines.
    const hydratedUniversalLines = applyPersistedEdits(
        initialLineState.universalLines,
        persistedState?.universal?.line_edits,
    );
    const hydratedScenarioLines = {} as Record<ScenarioId, CostLine[]>;
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        hydratedScenarioLines[id] = applyPersistedEdits(initialLineState.scenarioLines[id], persistedChild(id)?.line_edits);
    }

    const initialParams: ScenarioParams = persistedState?.params?.current
        ? fromSpecParams(persistedState.params.current)
        : builtInitial.params;
    const initialParamDefaults: ScenarioParams = persistedState?.params?.defaults
        ? fromSpecParams(persistedState.params.defaults)
        : builtInitial.params;

    const [params, setParams] = useState<ScenarioParams>(() => initialParams);
    const [baseline, setBaseline] = useState<ScenarioParams>(() => initialParams);
    // Engine-computed spec values — "what it was before" for the red default hints.
    const [paramDefaults, setParamDefaults] = useState<ScenarioParams>(() => initialParamDefaults);
    // Once the user edits the overs field, keep sending it on every recalc so it doesn't
    // get overwritten by the backend's num_standees-derived default.
    const [oversPinned, setOversPinned] = useState(() => initialParams.overs !== initialParamDefaults.overs);
    const [universalLines, setUniversalLines] = useState<CostLine[]>(() => hydratedUniversalLines);
    const [universalSubtotalOverride, setUniversalSubtotalOverride] = useState<string>(() =>
        persistedState
            ? (persistedState.universal?.subtotal_override ?? "")
            : universalSubtotalOverrideFromUi(persistedBreakdownUi),
    );
    const [scenarioLines, setScenarioLines] = useState<Record<ScenarioId, CostLine[]>>(
        () => hydratedScenarioLines,
    );
    const [scenarioSubtotalOverride, setScenarioSubtotalOverride] = useState<Record<ScenarioId, string>>(() => {
        if (!persistedState) return scenarioSubtotalOverridesFromUi(persistedBreakdownUi);
        const out: Record<ScenarioId, string> = { 1: "", 2: "", 3: "", 4: "", 5: "" };
        for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) out[id] = persistedChild(id)?.subtotal_override ?? "";
        return out;
    });
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
    const [editedUniversalKeys, setEditedUniversalKeys] = useState<Set<string>>(
        () => new Set(Object.keys(persistedState?.universal?.line_edits ?? {})),
    );
    const [editedScenarioKeys, setEditedScenarioKeys] = useState<Record<ScenarioId, Set<string>>>(() => ({
        1: new Set(Object.keys(persistedChild(1)?.line_edits ?? {})),
        2: new Set(Object.keys(persistedChild(2)?.line_edits ?? {})),
        3: new Set(Object.keys(persistedChild(3)?.line_edits ?? {})),
        4: new Set(Object.keys(persistedChild(4)?.line_edits ?? {})),
        5: new Set(Object.keys(persistedChild(5)?.line_edits ?? {})),
    }));
    // Pristine default lines (pre-edit) — the "what it was before" values.
    const origUniversalLines = useRef<CostLine[]>(builtInitial.universalLines);
    const origScenarioLines  = useRef<Record<ScenarioId, CostLine[]>>(builtInitial.scenarioLines);
    // Latest raw backend blobs per scenario; persisted as each child's "defaults".
    const sourcesRef = useRef<Record<ScenarioId, Record<string, unknown>>>(initialSources);
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
    const needsSave = canPersistQuote && manualDirty;
    // Param edits OR outdated cost tables both require a fresh engine run.
    const canRecalculate = isDirty || costsStale;

    async function persistQuoteSnapshot(snapshot: QuoteSnapshot): Promise<boolean> {
        const qid = persistedQuoteId?.trim();
        const owner = quoteOwner?.trim();
        const changedBy = (typeof window !== "undefined" ? localStorage.getItem("username") : null)?.trim();
        if (!qid || !owner || !changedBy) return false;

        // Five scenario children: engine defaults + only the manually edited rows.
        const scenarios: Record<string, PersistedScenarioChild> = {};
        for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
            if (quoteData[`scenario_${id}`] === undefined && persistedChild(id) === undefined) continue;
            scenarios[String(id)] = {
                defaults: numericOnly(snapshot.sources[id] ?? {}),
                line_edits: lineEditsFor(snapshot.scenarioLines[id] ?? [], snapshot.scenarioEdited[id] ?? new Set()),
                subtotal_override: (snapshot.scenarioSubtotalOverride[id] ?? "").trim(),
            };
        }

        const parsedMargin = parseFloat(contributionMargin);
        const contribution_margin =
            Number.isFinite(parsedMargin) && parsedMargin >= 0 && parsedMargin < 100 ? parsedMargin : 0;
        const body = {
            quote_name: (quoteName ?? "").trim() || "Untitled quote",
            num_standees: snapshot.params.numStandees,
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
            scenarios,
            universal: {
                line_edits: lineEditsFor(snapshot.universalLines, snapshot.universalEdited),
                subtotal_override: snapshot.universalSubtotalOverride.trim(),
            },
            params: {
                current: toSpecParams(snapshot.params),
                defaults: toSpecParams(snapshot.paramDefaults),
            },
            ...(typeof snapshot.costTablesVersion === "string"
                ? { cost_tables_version: snapshot.costTablesVersion }
                : {}),
        };
        const res = await fetch(`${API_BASE}/quotes/${encodeURIComponent(qid)}?owner=${encodeURIComponent(owner)}&changed_by=${encodeURIComponent(changedBy)}`, {
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
            const ok = await persistQuoteSnapshot({
                params,
                paramDefaults,
                universalLines,
                universalEdited: editedUniversalKeys,
                universalSubtotalOverride,
                scenarioLines,
                scenarioEdited: editedScenarioKeys,
                scenarioSubtotalOverride,
                sources: sourcesRef.current,
            });
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
        // Manual edits take over the row: drop any backend-provided rawTotal so the
        // displayed total becomes qty × unitCost.
        setUniversalLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value, rawTotal: undefined } : l));
        const orig = origUniversalLines.current.find((l) => l.key === key);
        const cur  = universalLines.find((l) => l.key === key);
        const next = cur ? { ...cur, [field]: value } : null;
        setEditedUniversalKeys((prev) => {
            const s = new Set(prev);
            if (orig && next && Math.abs(orig.qty - next.qty) < 0.005 && Math.abs(orig.unitCost - next.unitCost) < 0.005) s.delete(key);
            else s.add(key);
            return s;
        });
    }

    function updateScenario(key: string, field: "qty" | "unitCost", value: number) {
        setManualDirty(true);
        const syncGroup = SCENARIO_SYNC_GROUPS[key];
        const scenariosToUpdate: ScenarioId[] =
            syncGroup?.includes(activeScenario) ? syncGroup : [activeScenario];

        setScenarioLines((prev) => {
            const next = { ...prev };
            for (const sid of scenariosToUpdate) {
                if (!prev[sid]) continue;
                // Drop rawTotal on manual edit so buyout rows recompute as qty × unitCost.
                const lines = prev[sid].map((l) => l.key === key ? { ...l, [field]: value, rawTotal: undefined } : l);
                next[sid] = lines;
            }
            return next;
        });

        setEditedScenarioKeys((prev) => {
            const next = { ...prev };
            for (const sid of scenariosToUpdate) {
                const orig    = origScenarioLines.current[sid]?.find((l) => l.key === key);
                const cur     = scenarioLines[sid]?.find((l) => l.key === key);
                const updated = cur ? { ...cur, [field]: value } : null;
                const s = new Set(prev[sid]);
                if (orig && updated && Math.abs(orig.qty - updated.qty) < 0.005 && Math.abs(orig.unitCost - updated.unitCost) < 0.005) {
                    s.delete(key);
                } else {
                    s.add(key);
                }
                next[sid] = s;
            }
            return next;
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
            const newSources = { ...sourcesRef.current };
            for (const sid of [1, 2, 3, 4, 5] as ScenarioId[]) {
                const src = (data[`scenario_${sid}`] ?? {}) as Record<string, number>;
                if (data[`scenario_${sid}`]) {
                    newSl[sid] = seedLines(buildLines(SCENARIO_KEYS[sid], SCENARIO_LINE_DEFS), src);
                    newDebug[sid] = extractDebugExplanations({ [sid]: src })[sid] ?? {};
                    newSources[sid] = data[`scenario_${sid}`] as Record<string, unknown>;
                }
            }
            const newParams: ScenarioParams = { ...params, overs: firstSrc.overs ?? params.overs };
            // Unpinned overs come back engine-computed, so they become the new default.
            const nextParamDefaults: ScenarioParams = {
                ...paramDefaults,
                ...(oversPinned ? {} : { overs: firstSrc.overs ?? paramDefaults.overs }),
            };
            const newSso: Record<ScenarioId, string> = { 1: "", 2: "", 3: "", 4: "", 5: "" };
            sourcesRef.current = newSources;
            setUniversalLines(newUniversalLines);
            setUniversalSubtotalOverride("");
            setScenarioLines(newSl);
            setScenarioSubtotalOverride(newSso);
            setParams(newParams);
            setBaseline({ ...newParams });
            setParamDefaults(nextParamDefaults);
            setDebugExplanations(newDebug);
            setManualDirty(false);
            setEditedUniversalKeys(new Set());
            setEditedScenarioKeys({ 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() });
            origUniversalLines.current = newUniversalLines;
            origScenarioLines.current  = newSl;
            // Standee count is now committed to the quote — sync it back to the project.
            if (newParams.numStandees !== baseline.numStandees) {
                onNumStandeesCommitted?.(newParams.numStandees);
            }
            if (canPersistQuote) {
                setIsSavingQuote(true);
                try {
                    const ok = await persistQuoteSnapshot({
                        params: newParams,
                        paramDefaults: nextParamDefaults,
                        universalLines: newUniversalLines,
                        universalEdited: new Set(),
                        universalSubtotalOverride: "",
                        scenarioLines: newSl,
                        scenarioEdited: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() },
                        scenarioSubtotalOverride: newSso,
                        sources: newSources,
                        ...(typeof data?.cost_tables_version === "string"
                            ? { costTablesVersion: data.cost_tables_version as string }
                            : {}),
                    });
                    if (!ok) setSaveQuoteError("Could not save quote after recalculate");
                    else onCostsSynced?.();
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

    // Scenario 2 disabled — no longer displayed as a tab, even for older saved quotes that
    // still carry a scenario_2 blob. Tabs now go 1, 3, 4, 5.
    const availableScenarios: ScenarioId[] = [1, 3, 4, 5].filter(
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
                        Scenario {displayScenarioNumber(activeScenario)} — {SCENARIO_META[activeScenario].short}: {SCENARIO_META[activeScenario].sub}
                    </p>
                    {COST_DEBUG_ENABLED && (
                        <p className="text-[10px] font-bold text-[#F57F17] bg-[#FFF8E1] border border-[#FFE082] rounded-sm px-2 py-1">
                            Debug mode: hover the orange ? icons for backend calculation formulas.
                            {debugExplanationsLoading && " Loading formulas…"}
                            {debugExplanationsError && ` ${debugExplanationsError}`}
                        </p>
                    )}
                    {costsStale && (
                        <div className="flex flex-wrap items-center gap-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2">
                            <p className="text-[11px] font-semibold text-red-700 leading-snug flex-1 min-w-[200px]">
                                Cost tables were updated in Data Collector since this quote was calculated.
                                Recalculate to refresh totals.
                            </p>
                            <button
                                type="button"
                                onClick={() => void recalculate()}
                                disabled={isRecalculating}
                                className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                                {isRecalculating ? "Updating…" : "↻ Update costs"}
                            </button>
                        </div>
                    )}
                </div>

                {/* Parameters card */}
                <div className="shrink-0 flex items-center gap-6 bg-white border-2 border-[#E0E0E0] rounded-sm px-5 py-4 flex-wrap">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Number of Standees</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
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
                        {numStandees !== paramDefaults.numStandees && (
                            <span className="text-[9px] text-red-600 font-bold">previous: {paramDefaults.numStandees}</span>
                        )}
                    </div>
                    <div className="h-10 w-px bg-[#E0E0E0]" />
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Print Forms / Standee</span>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={printFormsPerStandee}
                            onChange={(e) => patchParams({ printFormsPerStandee: Math.max(0, parseInt(e.target.value) || 0) })}
                            disabled={isRecalculating}
                            className={`border-2 border-[#E0E0E0] rounded-sm px-3 py-1.5 text-sm font-black text-[#000005] outline-none focus:border-[#FFC843] w-[100px] text-right transition-colors disabled:opacity-50 ${printFormsPerStandee !== baseline.printFormsPerStandee ? "bg-[#FFC843]/20" : "bg-[#F8F8F8]"}`}
                        />
                        {printFormsPerStandee !== paramDefaults.printFormsPerStandee && (
                            <span className="text-[9px] text-red-600 font-bold">previous: {paramDefaults.printFormsPerStandee}</span>
                        )}
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
                        {structureFormsPerStandee !== paramDefaults.structureFormsPerStandee && (
                            <span className="text-[9px] text-red-600 font-bold">previous: {paramDefaults.structureFormsPerStandee}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Blank Forms / Standee</span>
                        <span className="text-sm font-black text-[#000005] text-right py-1.5">
                            {printFormsPerStandee + structureFormsPerStandee}
                        </span>
                        {printFormsPerStandee + structureFormsPerStandee !==
                            paramDefaults.printFormsPerStandee + paramDefaults.structureFormsPerStandee && (
                            <span className="text-[9px] text-red-600 font-bold">
                                previous: {paramDefaults.printFormsPerStandee + paramDefaults.structureFormsPerStandee}
                            </span>
                        )}
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
                        {overs !== paramDefaults.overs && (
                            <span className="text-[9px] text-red-600 font-bold">previous: {paramDefaults.overs}</span>
                        )}
                    </div>
                    <div className="h-10 w-px bg-[#E0E0E0]" />
                    <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={recalculate}
                                disabled={isRecalculating || !canRecalculate}
                                className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                                    costsStale && !isDirty
                                        ? "bg-red-600 text-white hover:bg-red-700"
                                        : "bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white"
                                }`}
                            >
                                {isRecalculating ? "Recalculating…" : costsStale && !isDirty ? "↻ Update costs" : "↻ Recalculate"}
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
                                        origLine={origUniversalLines.current.find((l) => l.key === line.key)}
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
                                <span className="text-[#FFC843]">// </span>Scenario {displayScenarioNumber(activeScenario)} Costs
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
                                        origLine={origScenarioLines.current[activeScenario]?.find((l) => l.key === line.key)}
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
