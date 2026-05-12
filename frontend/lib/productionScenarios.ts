export type ProductionScenarioId = 1 | 2 | 3 | 4 | 5;

export const ALL_PRODUCTION_SCENARIO_IDS: ProductionScenarioId[] = [1, 2, 3, 4, 5];

export const PRODUCTION_SCENARIO_META: Record<ProductionScenarioId, { short: string; sub: string }> = {
    1: { short: "Internal", sub: "Packed Out" },
    2: { short: "Internal", sub: "Assembled" },
    3: { short: "Hybrid", sub: "Internal Finishing" },
    4: { short: "Hybrid", sub: "External Die Cut" },
    5: { short: "External", sub: "Full Outsource" },
};
