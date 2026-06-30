/**
 * Toggle formula tooltips on quote breakdown rows (backend must also have
 * `COST_DEBUG_ENABLED = True` in `backend/lib/cost_debug.py`).
 *
 * Set to `false` before production deploys.
 */
export const COST_DEBUG_ENABLED = true;

export type CostDebugExplanations = Record<string, string>;

export function extractDebugExplanations(
    sources: Record<number, Record<string, unknown>>,
): Record<number, CostDebugExplanations> {
    const out: Record<number, CostDebugExplanations> = {};
    for (const id of [1, 2, 3, 4, 5]) {
        const raw = sources[id]?._debug_explanations;
        out[id] =
            raw && typeof raw === "object" && !Array.isArray(raw)
                ? (raw as CostDebugExplanations)
                : {};
    }
    return out;
}

/** Pull ``_debug_explanations`` from a ``/generate_quote`` response. */
export function debugExplanationsFromQuoteResponse(
    data: Record<string, unknown>,
): Record<number, CostDebugExplanations> {
    const sources: Record<number, Record<string, unknown>> = {};
    for (const id of [1, 2, 3, 4, 5]) {
        const blob = data[`scenario_${id}`];
        if (blob && typeof blob === "object" && !Array.isArray(blob)) {
            sources[id] = blob as Record<string, unknown>;
        }
    }
    return extractDebugExplanations(sources);
}

export function hasDebugExplanations(
    explanations: Record<number, CostDebugExplanations>,
    scenarioIds: number[],
): boolean {
    return scenarioIds.some((id) => Object.keys(explanations[id] ?? {}).length > 0);
}
