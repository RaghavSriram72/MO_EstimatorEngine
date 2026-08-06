// Reuses QuoteBreakdown's own cost model (line defs, scenario key lists, lineTotal formula)
// so history's "total cost" numbers can never drift from what the live quote UI shows.
import { UNIVERSAL_LINE_DEFS, SCENARIO_LINE_DEFS, SCENARIO_KEYS, lineTotal, type ScenarioId } from "@/components/QuoteBreakdown";

type LineEdit = { qty?: unknown; unit_cost?: unknown };
type CustomLine = { cost?: unknown };

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function customLinesSum(customLines: CustomLine[] | undefined): number {
    if (!Array.isArray(customLines)) return 0;
    return customLines.reduce((s, l) => s + (isFiniteNumber(l?.cost) ? l.cost : 0), 0);
}

/** A line's engine-computed dollar total is `defaults[key]` directly (that's what the backend's
 * `source[line.key]` already is); a manual edit replaces it with qty × unit_cost (or just
 * unit_cost for "flat" units), mirroring QuoteBreakdown's own `lineTotal`. */
function effectiveLineValue(unit: string, defaultsValue: unknown, edit: LineEdit | undefined): number {
    if (edit && isFiniteNumber(edit.qty) && isFiniteNumber(edit.unit_cost)) {
        return lineTotal({ key: "", label: "", unit, qty: edit.qty, unitCost: edit.unit_cost });
    }
    return isFiniteNumber(defaultsValue) ? defaultsValue : 0;
}

function overrideValue(subtotalOverride: unknown): number | null {
    if (typeof subtotalOverride !== "string" || subtotalOverride.trim() === "") return null;
    const parsed = parseFloat(subtotalOverride);
    return Number.isFinite(parsed) ? parsed : null;
}

export function computeUniversalTotal(
    defaults: Record<string, unknown> | undefined,
    lineEdits: Record<string, LineEdit> | undefined,
    subtotalOverride: unknown,
    customLines?: CustomLine[],
): number {
    const override = overrideValue(subtotalOverride);
    if (override !== null) return override;
    let sum = 0;
    for (const key of Object.keys(UNIVERSAL_LINE_DEFS)) {
        sum += effectiveLineValue(UNIVERSAL_LINE_DEFS[key].unit, defaults?.[key], lineEdits?.[key]);
    }
    return sum + customLinesSum(customLines);
}

export function computeScenarioLinesTotal(
    scenarioId: ScenarioId,
    defaults: Record<string, unknown> | undefined,
    lineEdits: Record<string, LineEdit> | undefined,
    subtotalOverride: unknown,
): number {
    const override = overrideValue(subtotalOverride);
    if (override !== null) return override;
    let sum = 0;
    for (const key of SCENARIO_KEYS[scenarioId] ?? []) {
        sum += effectiveLineValue(SCENARIO_LINE_DEFS[key]?.unit ?? "units", defaults?.[key], lineEdits?.[key]);
    }
    return sum;
}

/** The dollar value of one specific cost line (universal or scenario-scoped), for showing
 * "this field went from $X to $Y" rather than just flagging that something changed. */
export function computeLineValue(
    costKey: string,
    scope: "universal" | ScenarioId,
    defaults: Record<string, unknown> | undefined,
    lineEdits: Record<string, LineEdit> | undefined,
): number {
    const def = scope === "universal" ? UNIVERSAL_LINE_DEFS[costKey] : SCENARIO_LINE_DEFS[costKey];
    return effectiveLineValue(def?.unit ?? "units", defaults?.[costKey], lineEdits?.[costKey]);
}

export function formatCurrency(v: number): string {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
