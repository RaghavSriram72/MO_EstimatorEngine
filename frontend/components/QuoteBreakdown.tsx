"use client";
import { useState } from "react";
import { type QuoteData, type QuoteBreakdownUi, type RequestPayload } from "@/pages/Inputter";
import { API_BASE } from "@/lib/config";

type ScenarioId = 1 | 2 | 3 | 4 | 5;

type CostLine = {
    key: string;
    label: string;
    unit: string;
    qty: number;
    unitCost: number;
};

type ScenarioParams = {
    numStandees: number;
    printFormsPerStandee: number;
    structureFormsPerStandee: number;
    overs: number;
};

type PerScenarioState = {
    universalLines: CostLine[];
    universalSubtotalOverride: string;
};

type Props = {
    quoteData: QuoteData;
    numStandees: number;
    requestPayload: RequestPayload;
    initialActiveScenario?: ScenarioId;
    quoteName?: string | null;
    /** When set with ``quoteOwner``, edits can be persisted via PATCH. */
    persistedQuoteId?: string | null;
    quoteOwner?: string | null;
    onBack: () => void;
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

type LineDef = { label: string; unit: string };

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
    freight_cost:           { label: "Freight Cost",         unit: "flat"     },
};

const SCENARIO_KEYS: Record<ScenarioId, string[]> = {
    1: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost"],
    2: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost"],
    3: ["corrugate_cost", "print_form_cost", "print_cost", "rollx_cost", "zund_cut_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost"],
    4: ["corrugate_cost", "print_form_cost", "print_cost", "shipping_box_cost", "label_cost", "instruction_sheet_cost", "pallet_material_cost", "pallet_labor_cost", "freight_cost", "die_cost"],
    5: ["corrugate_cost", "print_form_cost", "label_cost", "instruction_sheet_cost", "freight_cost", "die_cost"],
};

function lineTotal(l: CostLine) {
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
    instruction_sheet_cost: (s) => s.num_standees         ?? 1,
    pallet_material_cost:   (s) => s.pallet_count         ?? 1,
    pallet_labor_cost:      (s) => s.pallet_count         ?? 1,
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
        const rawQty = getQty ? getQty(source) : 1;
        const qty    = rawQty > 0 ? rawQty : 1;
        return { ...line, qty, unitCost: total / qty };
    });
}

function buildScenarioState(
    sources: Record<ScenarioId, Record<string, number>>,
    initialStandees: number,
): {
    params: ScenarioParams;
    perScenario: Record<ScenarioId, PerScenarioState>;
    scenarioLines: Record<ScenarioId, CostLine[]>;
} {
    const ids: ScenarioId[] = [1, 2, 3, 4, 5];
    const perScenario = {} as Record<ScenarioId, PerScenarioState>;
    const scenarioLines = {} as Record<ScenarioId, CostLine[]>;
    const src1 = sources[1] ?? {};
    const params: ScenarioParams = {
        numStandees: initialStandees,
        printFormsPerStandee: src1.print_forms_per_standee ?? 1,
        structureFormsPerStandee: src1.structure_forms_per_standee ?? 0,
        overs: src1.overs ?? 0,
    };
    for (const id of ids) {
        const src = sources[id] ?? {};
        perScenario[id] = {
            universalLines: seedLines(buildLines(Object.keys(UNIVERSAL_LINE_DEFS), UNIVERSAL_LINE_DEFS), src),
            universalSubtotalOverride: "",
        };
        scenarioLines[id] = seedLines(buildLines(SCENARIO_KEYS[id], SCENARIO_LINE_DEFS), src);
    }
    return { params, perScenario, scenarioLines };
}

function breakdownUiFromQuoteData(q: QuoteData): QuoteBreakdownUi | undefined {
    const ui = q._breakdown_ui;
    if (!ui || typeof ui !== "object" || Array.isArray(ui)) return undefined;
    if (!("universal_subtotal_override" in ui) && !("scenario_subtotal_override" in ui)) return undefined;
    return ui as QuoteBreakdownUi;
}

function mergeBreakdownUiIntoPerScenario(
    perScenario: Record<ScenarioId, PerScenarioState>,
    ui: QuoteBreakdownUi | undefined,
): Record<ScenarioId, PerScenarioState> {
    const uo = ui?.universal_subtotal_override;
    if (!uo || typeof uo !== "object") return perScenario;
    const next: Record<ScenarioId, PerScenarioState> = { ...perScenario };
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const raw = uo[String(id)];
        if (raw != null && String(raw).trim() !== "") {
            next[id] = { ...next[id], universalSubtotalOverride: String(raw) };
        }
    }
    return next;
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
    perScenario: Record<ScenarioId, PerScenarioState>,
    scenarioLines: Record<ScenarioId, CostLine[]>,
    initialSources: Record<ScenarioId, Record<string, number>>,
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
    for (const line of perScenario[id].universalLines) {
        base[line.key] = lineTotal(line);
        const qtySrc = LINE_KEY_TO_QTY_SOURCE[line.key];
        if (qtySrc) {
            base[qtySrc] = line.qty;
        }
    }
    for (const line of scenarioLines[id]) {
        base[line.key] = lineTotal(line);
        const qtySrc = LINE_KEY_TO_QTY_SOURCE[line.key];
        if (qtySrc) {
            base[qtySrc] = line.qty;
        }
    }
    return base;
}

function buildBreakdownUiPayloadFromState(
    perScenario: Record<ScenarioId, PerScenarioState>,
    scenarioSubtotalOverride: Record<ScenarioId, string>,
): Record<string, Record<string, string>> | null {
    const universal_subtotal_override: Record<string, string> = {};
    const scenario_subtotal_override: Record<string, string> = {};
    for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
        const u = perScenario[id]?.universalSubtotalOverride?.trim() ?? "";
        const s = scenarioSubtotalOverride[id]?.trim() ?? "";
        if (u) universal_subtotal_override[String(id)] = u;
        if (s) scenario_subtotal_override[String(id)] = s;
    }
    const out: Record<string, Record<string, string>> = {};
    if (Object.keys(universal_subtotal_override).length > 0) {
        out.universal_subtotal_override = universal_subtotal_override;
    }
    if (Object.keys(scenario_subtotal_override).length > 0) {
        out.scenario_subtotal_override = scenario_subtotal_override;
    }
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

function CostRow({
    line,
    onChange,
}: {
    line: CostLine;
    onChange: (key: string, field: "qty" | "unitCost", value: number) => void;
}) {
    const isFlat     = line.unit === "flat";
    const isStandees = line.unit === "standees";
    const total      = lineTotal(line);

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
                        <span className="text-[9px] text-[#B1B3B6] uppercase font-bold tracking-wider">{line.unit}</span>
                        {isStandees ? (
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
    persistedQuoteId = null,
    quoteOwner = null,
    onBack,
}: Props) {
    const [activeScenario, setActiveScenario] = useState<ScenarioId>(() =>
        resolveInitialActiveScenario(quoteData, initialActiveScenario),
    );
    const [isRecalculating, setIsRecalculating] = useState(false);

    const initialSources: Record<ScenarioId, Record<string, number>> = {
        1: (quoteData["scenario_1"] as Record<string, number>) ?? {},
        2: (quoteData["scenario_2"] as Record<string, number>) ?? {},
        3: (quoteData["scenario_3"] as Record<string, number>) ?? {},
        4: (quoteData["scenario_4"] as Record<string, number>) ?? {},
        5: (quoteData["scenario_5"] as Record<string, number>) ?? {},
    };

    const builtInitial = buildScenarioState(initialSources, initialStandees);
    const [params, setParams] = useState<ScenarioParams>(() => builtInitial.params);
    const [baseline, setBaseline] = useState<ScenarioParams>(() => builtInitial.params);
    const [perScenario, setPerScenario] = useState<Record<ScenarioId, PerScenarioState>>(() =>
        mergeBreakdownUiIntoPerScenario(builtInitial.perScenario, breakdownUiFromQuoteData(quoteData)),
    );
    const [scenarioLines, setScenarioLines] = useState<Record<ScenarioId, CostLine[]>>(
        () => buildScenarioState(initialSources, initialStandees).scenarioLines
    );
    const [scenarioSubtotalOverride, setScenarioSubtotalOverride] = useState<Record<ScenarioId, string>>(() =>
        scenarioSubtotalOverridesFromUi(breakdownUiFromQuoteData(quoteData))
    );
    const [isSavingQuote, setIsSavingQuote] = useState(false);
    const [saveQuoteError, setSaveQuoteError] = useState<string | null>(null);
    const [recalculateError, setRecalculateError] = useState<string | null>(null);
    const [universalCostsExpanded, setUniversalCostsExpanded] = useState(false);
    const [scenarioCostsExpanded, setScenarioCostsExpanded] = useState(false);

    const { universalLines, universalSubtotalOverride } = perScenario[activeScenario];
    const { numStandees, printFormsPerStandee, structureFormsPerStandee, overs } = params;

    const isDirty =
        numStandees !== baseline.numStandees ||
        printFormsPerStandee !== baseline.printFormsPerStandee ||
        structureFormsPerStandee !== baseline.structureFormsPerStandee ||
        overs !== baseline.overs;

    const canPersistQuote = Boolean(persistedQuoteId?.trim() && quoteOwner?.trim());
    const needsSave = canPersistQuote && isDirty;

    async function persistQuoteSnapshots(
        sharedParams: ScenarioParams,
        ps: Record<ScenarioId, PerScenarioState>,
        sl: Record<ScenarioId, CostLine[]>,
        sso: Record<ScenarioId, string>,
        scenarioForMeta: ScenarioId,
    ): Promise<boolean> {
        const qid = persistedQuoteId?.trim();
        const owner = quoteOwner?.trim();
        if (!qid || !owner) return false;
        const breakdown: Record<string, unknown> = {};
        for (const id of [1, 2, 3, 4, 5] as ScenarioId[]) {
            if (quoteData[`scenario_${id}`] === undefined) continue;
            breakdown[`scenario_${id}`] = serializeScenarioToSource(id, sharedParams, ps, sl, initialSources);
        }
        const ui = buildBreakdownUiPayloadFromState(ps, sso);
        if (ui) breakdown._breakdown_ui = ui;
        const body = {
            quote_name: (quoteName ?? "").trim() || "Untitled quote",
            num_standees: sharedParams.numStandees,
            scenario: scenarioForMeta,
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
                perScenario,
                scenarioLines,
                scenarioSubtotalOverride,
                activeScenario,
            );
            if (ok) {
                setBaseline({ ...params });
            } else {
                setSaveQuoteError("Could not save quote");
            }
        } catch {
            setSaveQuoteError("Could not save quote");
        } finally {
            setIsSavingQuote(false);
        }
    }

    function patchActive(patch: Partial<PerScenarioState>) {
        setPerScenario((prev) => ({
            ...prev,
            [activeScenario]: { ...prev[activeScenario], ...patch },
        }));
    }

    function patchParams(updates: Partial<ScenarioParams>) {
        setParams((prev) => ({ ...prev, ...updates }));
    }

    function updateUniversal(key: string, field: "qty" | "unitCost", value: number) {
        setPerScenario((prev) => ({
            ...prev,
            [activeScenario]: {
                ...prev[activeScenario],
                universalLines: prev[activeScenario].universalLines.map((l) =>
                    l.key === key ? { ...l, [field]: value } : l
                ),
            },
        }));
    }

    function updateScenario(key: string, field: "qty" | "unitCost", value: number) {
        setScenarioLines((prev) => ({
            ...prev,
            [activeScenario]: prev[activeScenario].map((l) => (l.key === key ? { ...l, [field]: value } : l)),
        }));
    }

    function recalculate() {
        setIsRecalculating(true);
        setSaveQuoteError(null);
        setRecalculateError(null);
        const sid = activeScenario;
        const body = {
            ...requestPayload,
            scenario: sid,
            num_standees: params.numStandees,
            persist_project: false,
            ...(params.printFormsPerStandee !== baseline.printFormsPerStandee && {
                print_forms_per_standee: params.printFormsPerStandee,
            }),
            ...(params.structureFormsPerStandee !== baseline.structureFormsPerStandee && {
                structure_forms_per_standee: params.structureFormsPerStandee,
            }),
            ...(params.overs !== baseline.overs && { num_overs: params.overs }),
        };
        fetch(`${API_BASE}/generate_quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    console.error("Recalculate failed:", data);
                    setRecalculateError("Recalculate failed — check console for details");
                    return null;
                }
                console.log("Recalculate response:", data);
                return data;
            })
            .then(async (data) => {
                if (!data) return;
                const src: Record<string, number> = (data[`scenario_${sid}`] as Record<string, number>) ?? {};
                const newUniversalLines = seedLines(
                    buildLines(Object.keys(UNIVERSAL_LINE_DEFS), UNIVERSAL_LINE_DEFS), src
                );
                const newScenarioLines = seedLines(buildLines(SCENARIO_KEYS[sid], SCENARIO_LINE_DEFS), src);
                const newParams: ScenarioParams = { ...params, overs: src.overs ?? params.overs };
                const mergedPs: Record<ScenarioId, PerScenarioState> = {
                    ...perScenario,
                    [sid]: { universalLines: newUniversalLines, universalSubtotalOverride: "" },
                };
                const mergedSl: Record<ScenarioId, CostLine[]> = {
                    ...scenarioLines,
                    [sid]: newScenarioLines,
                };
                const mergedSso: Record<ScenarioId, string> = {
                    ...scenarioSubtotalOverride,
                    [sid]: "",
                };
                setParams(newParams);
                setBaseline({ ...newParams });
                setPerScenario(mergedPs);
                setScenarioLines(mergedSl);
                setScenarioSubtotalOverride(mergedSso);
                if (canPersistQuote) {
                    setIsSavingQuote(true);
                    try {
                        const ok = await persistQuoteSnapshots(newParams, mergedPs, mergedSl, mergedSso, sid);
                        if (!ok) setSaveQuoteError("Could not save quote after recalculate");
                    } catch {
                        setSaveQuoteError("Could not save quote after recalculate");
                    } finally {
                        setIsSavingQuote(false);
                    }
                }
            })
            .catch((err) => {
                console.error("Recalculate error:", err);
                setRecalculateError("Recalculate failed — network error");
            })
            .finally(() => setIsRecalculating(false));
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

    const availableScenarios: ScenarioId[] = [1, 2, 3, 4, 5].filter(
        (id) => quoteData[`scenario_${id}`] !== undefined,
    ) as ScenarioId[];

    return (
        <div className="flex flex-col w-full flex-1 min-h-0 overflow-hidden text-[#000005] bg-[#F8F8F8]">
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-8 py-6 gap-5">

                {/* Header: quote name, title, scenario tabs, back */}
                <div className="shrink-0 flex flex-col gap-4">
                    <div className="flex flex-row items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            {quoteName?.trim() ? (
                                <h1 className="text-xl sm:text-2xl font-black text-[#000005] uppercase tracking-tight leading-snug break-words mb-2">
                                    {(quoteName ?? "").trim()}
                                </h1>
                            ) : null}
                            <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// BREAKDOWN</div>
                            <div className="text-2xl sm:text-3xl font-black text-[#000005] uppercase tracking-tight">
                                Quote Breakdown
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onBack}
                            className="shrink-0 text-xs font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-2 px-3 rounded-sm cursor-pointer hover:bg-[#000005] hover:text-white hover:border-[#000005] transition-all duration-200 uppercase tracking-widest"
                        >
                            ← BACK
                        </button>
                    </div>

                    {availableScenarios.length > 1 ? (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black text-[#B1B3B6] uppercase tracking-widest">Scenario</span>
                            <div className="flex flex-wrap gap-2">
                                {availableScenarios.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveScenario(id)}
                                        className={`text-left rounded-sm border-2 px-3 py-2 transition-all duration-200 ${
                                            activeScenario === id
                                                ? "tab-active border-[#000005]"
                                                : "tab-inactive border-[#E0E0E0] hover:border-[#B1B3B6]"
                                        }`}
                                    >
                                        <span className="block text-xs font-black uppercase tracking-wide">{SCENARIO_META[id].short}</span>
                                        <span className="block text-[10px] font-semibold text-[#B1B3B6]">{SCENARIO_META[id].sub}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <p className="text-xs text-[#B1B3B6] font-semibold">
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
                            onChange={(e) => patchParams({ numStandees: parseInt(e.target.value) || 0 })}
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
                            onChange={(e) => patchParams({ overs: Math.max(0, parseInt(e.target.value) || 0) })}
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
                    <div className="border-2 border-[#E0E0E0] rounded-sm bg-white p-4">
                        <button
                            type="button"
                            className="group w-full flex items-center justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#FFC843] rounded-sm hover:bg-[#F8F8F8] transition-colors"
                            onClick={() => setUniversalCostsExpanded((v) => !v)}
                            aria-expanded={universalCostsExpanded}
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
                        </button>
                        <div className={`grid transition-all duration-300 ease-in-out ${universalCostsExpanded ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                                {universalLines.map((line) => (
                                    <CostRow key={line.key} line={line} onChange={updateUniversal} />
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
                                            onChange={(e) => patchActive({ universalSubtotalOverride: e.target.value })}
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
                    <div className="border-2 border-[#E0E0E0] rounded-sm bg-white p-4">
                        <button
                            type="button"
                            className="group w-full flex items-center justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#FFC843] rounded-sm hover:bg-[#F8F8F8] transition-colors"
                            onClick={() => setScenarioCostsExpanded((v) => !v)}
                            aria-expanded={scenarioCostsExpanded}
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
                        </button>
                        <div className={`grid transition-all duration-300 ease-in-out ${scenarioCostsExpanded ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                                {scenarioLines[activeScenario].map((line) => (
                                    <CostRow key={line.key} line={line} onChange={updateScenario} />
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

                    {/* Grand total */}
                    <div className="shrink-0 sticky bottom-0 flex items-center justify-between bg-[#000005] text-white rounded-sm px-5 py-4">
                        <span className="text-sm font-black uppercase tracking-widest">Total Estimated Cost</span>
                        <span className="text-2xl font-black text-[#FFC843]">
                            ${fmt(grandTotal)}
                        </span>
                    </div>

                </div>
            </div>
        </div>
    );
}
