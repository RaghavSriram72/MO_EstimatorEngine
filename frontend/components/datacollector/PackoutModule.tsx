"use client";
import { useState, useEffect } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";
import ModuleFooter from "./ModuleFooter";
import DataCollectorHistoryModal from "./DataCollectorHistoryModal";
import { API_BASE, PackoutRecord } from "./shared";

const COMPLEXITIES = ["Simple", "Moderate", "Complex"] as const;
type Complexity = typeof COMPLEXITIES[number];

// Represents a numeric range with an optional upper bound (null means open-ended / no limit)
type BoundedRange = {
    lowerBound: number;
    upperBound: number | null;
};

// A new standee row the user is drafting before it has been saved to the database
type NewRowDraft = {
    standeesLower: string;
    standeesUpper: string;
    // Maps each forms tier's range key to the cost the user typed in that cell
    costByFormsKey: Record<string, string>;
};

// Builds a stable string key for a range so it can be used as a map/object key
function buildRangeKey(lowerBound: number, upperBound: number | null): string {
    return `${lowerBound}|${upperBound ?? "∞"}`;
}

export default function PackoutModule() {
    // All packout tier records fetched from the database
    const [savedTiers, setSavedTiers]                     = useState<PackoutRecord[]>([]);

    // Tracks cost edits: maps a record's database ID to the new cost the user typed
    const [editedCosts, setEditedCosts]                   = useState<Record<string, number>>({});

    // Tracks values typed into cells that have no backing record yet — keyed by
    // "<standeeKey>::<formsKey>" — so a gap in the matrix can be filled in directly
    // instead of only being addable via a brand-new "+ ADD ROW" standee range.
    const [missingCellEdits, setMissingCellEdits]         = useState<Record<string, string>>({});

    // Tracks standee range edits: maps the original range key to the new bounds the user typed
    const [editedStandeeRanges, setEditedStandeeRanges]   = useState<Record<string, BoundedRange>>({});

    // Tracks forms tier edits: maps the original range key to the new bounds the user typed
    const [editedFormsRanges, setEditedFormsRanges]       = useState<Record<string, BoundedRange>>({});

    // New rows the user has added locally but not yet saved
    const [newRowDrafts, setNewRowDrafts]                 = useState<NewRowDraft[]>([]);

    const [activeComplexity, setActiveComplexity]         = useState<Complexity>("Simple");

    // The IDs of records the user has confirmed they want to delete (triggers confirm dialog)
    const [pendingDeletionIds, setPendingDeletionIds]     = useState<string[] | null>(null);

    const [isLoading, setIsLoading]                       = useState(false);
    const [isSaving, setIsSaving]                         = useState(false);
    const [historyOpen, setHistoryOpen]                   = useState(false);

    // Fetch all packout tiers from the API when the module first loads
    useEffect(() => {
        setIsLoading(true);
        fetch(`${API_BASE}/packout`)
            .then((r) => r.json())
            .then((data) => setSavedTiers(data.data ?? []))
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    // Re-fetch all tiers from the API and discard all local edits
    async function fetchAndResetAllEdits() {
        const data = await fetch(`${API_BASE}/packout`).then((r) => r.json());
        setSavedTiers(data.data ?? []);
        setEditedCosts({});
        setEditedStandeeRanges({});
        setEditedFormsRanges({});
        setMissingCellEdits({});
    }

    function missingCellKey(standeeKey: string, formsKey: string): string {
        return `${standeeKey}::${formsKey}`;
    }

    // Stores the user's typed value for a cell that has no backing record yet
    function updateMissingCellEdit(standeeKey: string, formsKey: string, rawValue: string) {
        setMissingCellEdits((prev) => ({ ...prev, [missingCellKey(standeeKey, formsKey)]: rawValue }));
    }

    // Only the tiers that belong to whichever complexity tab is currently active
    const tiersForActiveComplexity = savedTiers.filter(
        (tier) => tier.complexity.toLowerCase() === activeComplexity.toLowerCase(),
    );

    // Derive the unique standee ranges from the current complexity's data, sorted by lower bound.
    // Each entry represents one row in the pricing matrix.
    const uniqueStandeeRanges: BoundedRange[] = Array.from(
        new Map(
            tiersForActiveComplexity.map((tier) => [
                buildRangeKey(tier.standees_lower_bound, tier.standees_upper_bound),
                { lowerBound: tier.standees_lower_bound, upperBound: tier.standees_upper_bound },
            ])
        ).values()
    ).sort((a, b) => a.lowerBound - b.lowerBound);

    // Derive the unique forms tier ranges from the current complexity's data, sorted by lower bound.
    // Each entry represents one column in the pricing matrix.
    const uniqueFormsTiers: BoundedRange[] = Array.from(
        new Map(
            tiersForActiveComplexity.map((tier) => [
                buildRangeKey(tier.forms_lower_bound, tier.forms_upper_bound),
                { lowerBound: tier.forms_lower_bound, upperBound: tier.forms_upper_bound },
            ])
        ).values()
    ).sort((a, b) => a.lowerBound - b.lowerBound);

    // A 2D grid for quick cell lookup: standeeKey → formsKey → database record.
    // This lets us render the table without searching through the flat array for every cell.
    const recordGrid = new Map<string, Map<string, PackoutRecord>>();
    tiersForActiveComplexity.forEach((tier) => {
        const standeeKey = buildRangeKey(tier.standees_lower_bound, tier.standees_upper_bound);
        const formsKey   = buildRangeKey(tier.forms_lower_bound, tier.forms_upper_bound);
        if (!recordGrid.has(standeeKey)) recordGrid.set(standeeKey, new Map());
        recordGrid.get(standeeKey)!.set(formsKey, tier);
    });

    // Returns the current display bounds for a standee range row,
    // using the user's edited values if they exist, otherwise the saved values.
    function getCurrentStandeeBounds(savedRange: BoundedRange): BoundedRange {
        const key = buildRangeKey(savedRange.lowerBound, savedRange.upperBound);
        return editedStandeeRanges[key] ?? { lowerBound: savedRange.lowerBound, upperBound: savedRange.upperBound };
    }

    // Returns the current display bounds for a forms tier column,
    // using the user's edited values if they exist, otherwise the saved values.
    function getCurrentFormsBounds(savedRange: BoundedRange): BoundedRange {
        const key = buildRangeKey(savedRange.lowerBound, savedRange.upperBound);
        return editedFormsRanges[key] ?? { lowerBound: savedRange.lowerBound, upperBound: savedRange.upperBound };
    }

    // Updates one bound (lower or upper) for a standee range row header
    function updateStandeeBound(rangeKey: string, bound: "lowerBound" | "upperBound", rawValue: string) {
        setEditedStandeeRanges((prev) => {
            const current = prev[rangeKey] ?? { lowerBound: 0, upperBound: null };
            const parsedValue = bound === "upperBound" && rawValue === "" ? null : parseInt(rawValue) || 0;
            return { ...prev, [rangeKey]: { ...current, [bound]: parsedValue } };
        });
    }

    // Updates one bound (lower or upper) for a forms tier column header
    function updateFormsBound(rangeKey: string, bound: "lowerBound" | "upperBound", rawValue: string) {
        setEditedFormsRanges((prev) => {
            const current = prev[rangeKey] ?? { lowerBound: 0, upperBound: null };
            const parsedValue = bound === "upperBound" && rawValue === "" ? null : parseInt(rawValue) || 0;
            return { ...prev, [rangeKey]: { ...current, [bound]: parsedValue } };
        });
    }

    // Returns the cost to display in a cell — the user's edit if one exists, otherwise the saved value
    function getDisplayCost(record: PackoutRecord): number {
        return editedCosts[record._id] !== undefined ? editedCosts[record._id] : record.packout;
    }

    // Stores the user's cost edit for a specific cell
    function updateCostEdit(recordId: string, rawValue: string) {
        setEditedCosts((prev) => ({ ...prev, [recordId]: parseInt(rawValue) || 0 }));
    }

    // Appends a blank new row draft, pre-populated with one empty cost field per forms tier column
    function addNewRowDraft() {
        const emptyCostByFormsKey: Record<string, string> = {};
        uniqueFormsTiers.forEach((formsTier) => {
            emptyCostByFormsKey[buildRangeKey(formsTier.lowerBound, formsTier.upperBound)] = "";
        });
        setNewRowDrafts((prev) => [
            ...prev,
            { standeesLower: "", standeesUpper: "", costByFormsKey: emptyCostByFormsKey },
        ]);
    }

    // Updates the lower or upper standee bound on an unsaved new row
    function updateNewRowBound(rowIndex: number, field: "standeesLower" | "standeesUpper", value: string) {
        setNewRowDrafts((prev) =>
            prev.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row)
        );
    }

    // Updates the cost for one forms tier cell on an unsaved new row
    function updateNewRowCost(rowIndex: number, formsKey: string, value: string) {
        setNewRowDrafts((prev) =>
            prev.map((row, index) =>
                index === rowIndex
                    ? { ...row, costByFormsKey: { ...row.costByFormsKey, [formsKey]: value } }
                    : row
            )
        );
    }

    // Removes an unsaved new row draft without saving it
    function removeNewRowDraft(rowIndex: number) {
        setNewRowDrafts((prev) => prev.filter((_, index) => index !== rowIndex));
    }

    // Builds the full PATCH payload for a saved record by applying any pending
    // standee range edits, forms range edits, and cost edits on top of the saved values.
    function buildSavePayload(record: PackoutRecord) {
        const standeeKey       = buildRangeKey(record.standees_lower_bound, record.standees_upper_bound);
        const formsKey         = buildRangeKey(record.forms_lower_bound, record.forms_upper_bound);
        const standeeRangeEdit = editedStandeeRanges[standeeKey];
        const formsRangeEdit   = editedFormsRanges[formsKey];

        return {
            standees_lower_bound: standeeRangeEdit?.lowerBound ?? record.standees_lower_bound,
            standees_upper_bound: standeeRangeEdit !== undefined ? standeeRangeEdit.upperBound : record.standees_upper_bound,
            forms_lower_bound:    formsRangeEdit?.lowerBound ?? record.forms_lower_bound,
            forms_upper_bound:    formsRangeEdit !== undefined ? formsRangeEdit.upperBound : record.forms_upper_bound,
            complexity:           record.complexity,
            packout:              editedCosts[record._id] !== undefined ? editedCosts[record._id] : record.packout,
        };
    }

    // Returns true if a saved record has any pending edits that differ from what's in the database
    function recordHasUnsavedChanges(record: PackoutRecord): boolean {
        const payload = buildSavePayload(record);
        return (
            payload.standees_lower_bound !== record.standees_lower_bound ||
            payload.standees_upper_bound !== record.standees_upper_bound ||
            payload.forms_lower_bound    !== record.forms_lower_bound    ||
            payload.forms_upper_bound    !== record.forms_upper_bound    ||
            payload.packout              !== record.packout
        );
    }

    const hasFilledMissingCells = Object.values(missingCellEdits).some((v) => v !== "");

    const hasUnsavedChanges =
        tiersForActiveComplexity.some(recordHasUnsavedChanges) || newRowDrafts.length > 0 || hasFilledMissingCells;

    async function saveChanges() {
        if (!hasUnsavedChanges) return;
        setIsSaving(true);
        try {
            const changedBy = localStorage.getItem("username") ?? "";
            // PATCH every existing record that has at least one change
            const patchRequests = tiersForActiveComplexity
                .filter(recordHasUnsavedChanges)
                .map((record) =>
                    fetch(`${API_BASE}/packout/${record._id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...buildSavePayload(record), changed_by: changedBy }),
                    })
                );

            // POST one new database record for each previously-empty matrix cell the user filled in
            const missingCellRequests = uniqueStandeeRanges.flatMap((standeeRange) => {
                const standeeKey = buildRangeKey(standeeRange.lowerBound, standeeRange.upperBound);
                const currentStandeeBounds = getCurrentStandeeBounds(standeeRange);
                return uniqueFormsTiers
                    .filter((formsTier) => {
                        const formsKey = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                        if (recordGrid.get(standeeKey)?.get(formsKey)) return false;
                        const raw = missingCellEdits[missingCellKey(standeeKey, formsKey)];
                        return raw !== undefined && raw !== "";
                    })
                    .map((formsTier) => {
                        const formsKey = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                        const currentFormsBounds = getCurrentFormsBounds(formsTier);
                        return fetch(`${API_BASE}/packout`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                standees_lower_bound: currentStandeeBounds.lowerBound,
                                standees_upper_bound: currentStandeeBounds.upperBound,
                                forms_lower_bound:    currentFormsBounds.lowerBound,
                                forms_upper_bound:    currentFormsBounds.upperBound,
                                complexity:           activeComplexity,
                                packout:              parseInt(missingCellEdits[missingCellKey(standeeKey, formsKey)]) || 0,
                                changed_by:           changedBy,
                            }),
                        });
                    });
            });

            // POST one new database record per forms tier for each new row draft
            const postRequests = newRowDrafts
                .filter((draft) => draft.standeesLower !== "")
                .flatMap((draft) =>
                    uniqueFormsTiers
                        .filter((formsTier) => {
                            const formsKey = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                            return draft.costByFormsKey[formsKey] !== "";
                        })
                        .map((formsTier) => {
                            const formsKey = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                            return fetch(`${API_BASE}/packout`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    standees_lower_bound: parseInt(draft.standeesLower),
                                    standees_upper_bound: draft.standeesUpper === "" ? null : parseInt(draft.standeesUpper),
                                    forms_lower_bound:    formsTier.lowerBound,
                                    forms_upper_bound:    formsTier.upperBound,
                                    complexity:           activeComplexity,
                                    packout:              parseInt(draft.costByFormsKey[formsKey]) || 0,
                                    changed_by:           changedBy,
                                }),
                            });
                        })
                );

            await Promise.all([...patchRequests, ...postRequests, ...missingCellRequests]);
            await fetchAndResetAllEdits();
            setNewRowDrafts([]);
        } catch (error) { console.error(error); }
        finally { setIsSaving(false); }
    }

    // Sends DELETE requests for all records in the confirmed standee row, then reloads
    async function deleteConfirmedRows() {
        if (!pendingDeletionIds) return;
        const idsToDelete = pendingDeletionIds;
        setPendingDeletionIds(null);
        try {
            const changedBy = localStorage.getItem("username") ?? "";
            await Promise.all(
                idsToDelete.map((id) =>
                    fetch(`${API_BASE}/packout/${id}?changed_by=${encodeURIComponent(changedBy)}`, { method: "DELETE" })
                )
            );
            await fetchAndResetAllEdits();
        } catch (error) { console.error(error); }
    }

    // Tailwind class for the small inline bound inputs in row/column headers.
    // Transparent background so they blend into the table; yellow underline on focus.
    const rangeInputClass = [
        "w-[38px] text-xs text-[#000005] font-bold bg-transparent outline-none",
        "border-b-2 border-[#EDEAEA] hover:border-[#B1B3B6] focus:border-[#FFB604]",
        "transition-colors text-center",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
    ].join(" ");

    return (
        <>
            <ConfirmAlert
                visible={pendingDeletionIds !== null}
                message={`Delete this standee range? This removes ${pendingDeletionIds?.length ?? 0} tier records and cannot be undone.`}
                onConfirm={() => void deleteConfirmedRows()}
                onCancel={() => setPendingDeletionIds(null)}
            />

            {/* 01 — Complexity filter: determines which subset of tiers is shown in the matrix */}
            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — COMPLEXITY FILTER</div>
                <div className="flex flex-row gap-2 ml-2">
                    {COMPLEXITIES.map((complexity) => (
                        <button
                            key={complexity}
                            type="button"
                            onClick={() => setActiveComplexity(complexity)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-colors cursor-pointer ${
                                activeComplexity === complexity
                                    ? "bg-[#FFC843] border-[#FFC843] text-[#000005]"
                                    : "border-[#EDEAEA] text-[#ABABAB] hover:border-[#FFC843] hover:text-[#000005]"
                            }`}
                        >
                            {complexity}
                        </button>
                    ))}
                </div>
            </div>

            {/* 02 — Pricing matrix: rows = standee ranges, columns = forms tiers, cells = cost */}
            <div className="flex flex-col items-start w-full flex-1 p-5 overflow-auto">
                <div className="flex items-center gap-2 m-2 mb-3">
                    <span className="text-[10px]">02 — PRICING MATRIX</span>
                    {hasUnsavedChanges && (
                        <span className="text-[10px] font-bold text-[#FFB604] tracking-wide">Unsaved Changes</span>
                    )}
                </div>

                {isLoading ? (
                    <div className="text-xs m-2">Loading...</div>
                ) : (
                    <table className="border-collapse text-xs w-full">
                        <thead>
                            <tr>
                                {/* Corner label */}
                                <th className="text-left pb-3 pr-6 align-bottom">
                                    <span className="text-[9px] font-bold tracking-wider text-[#ABABAB]">STANDEES</span>
                                </th>

                                {/* Column headers — one per forms tier, with editable bound inputs */}
                                {uniqueFormsTiers.map((formsTier) => {
                                    const formsKey          = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                                    const currentBounds     = getCurrentFormsBounds(formsTier);
                                    const formsRangeEdited  = editedFormsRanges[formsKey] !== undefined &&
                                        (editedFormsRanges[formsKey].lowerBound !== formsTier.lowerBound ||
                                         editedFormsRanges[formsKey].upperBound !== formsTier.upperBound);
                                    return (
                                        <th key={formsKey} className="pb-3 px-2 align-bottom">
                                            <div className="flex flex-col items-start gap-1">
                                                <span className={`text-[9px] font-bold tracking-wider ${formsRangeEdited ? "text-[#FFB604]" : "text-[#ABABAB]"}`}>
                                                    FORMS {formsRangeEdited ? "·" : ""}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number" min={0} step={1}
                                                        value={currentBounds.lowerBound}
                                                        onChange={(e) => updateFormsBound(formsKey, "lowerBound", e.target.value)}
                                                        className={rangeInputClass}
                                                    />
                                                    <span className="text-[#B1B3B6] text-[10px]">–</span>
                                                    <input
                                                        type="number" min={0} step={1}
                                                        placeholder="∞"
                                                        value={currentBounds.upperBound ?? ""}
                                                        onChange={(e) => updateFormsBound(formsKey, "upperBound", e.target.value)}
                                                        className={rangeInputClass}
                                                    />
                                                </div>
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="w-[34px]" />
                            </tr>
                        </thead>
                        <tbody>
                            {/* Saved standee rows */}
                            {uniqueStandeeRanges.map((standeeRange) => {
                                const standeeKey = buildRangeKey(standeeRange.lowerBound, standeeRange.upperBound);

                                // Collect the IDs for all records in this standee row (one per forms tier)
                                const recordIdsInRow = uniqueFormsTiers
                                    .map((formsTier) => recordGrid.get(standeeKey)?.get(buildRangeKey(formsTier.lowerBound, formsTier.upperBound))?._id)
                                    .filter(Boolean) as string[];

                                const currentStandeeBounds  = getCurrentStandeeBounds(standeeRange);
                                const standeeRangeEdited    = editedStandeeRanges[standeeKey] !== undefined &&
                                    (editedStandeeRanges[standeeKey].lowerBound !== standeeRange.lowerBound ||
                                     editedStandeeRanges[standeeKey].upperBound !== standeeRange.upperBound);

                                return (
                                    <tr key={standeeKey} className="group">
                                        {/* Row header with editable standee range bounds */}
                                        <td className="pr-6 py-1.5 align-middle">
                                            <div className="flex flex-col gap-0.5">
                                                {standeeRangeEdited && (
                                                    <span className="text-[8px] text-[#FFB604] font-bold leading-none">CHANGED</span>
                                                )}
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number" min={0} step={1}
                                                        value={currentStandeeBounds.lowerBound}
                                                        onChange={(e) => updateStandeeBound(standeeKey, "lowerBound", e.target.value)}
                                                        className={rangeInputClass}
                                                    />
                                                    <span className="text-[#B1B3B6] text-[10px]">–</span>
                                                    <input
                                                        type="number" min={0} step={1}
                                                        placeholder="∞"
                                                        value={currentStandeeBounds.upperBound ?? ""}
                                                        onChange={(e) => updateStandeeBound(standeeKey, "upperBound", e.target.value)}
                                                        className={rangeInputClass}
                                                    />
                                                </div>
                                            </div>
                                        </td>

                                        {/* One cost cell per forms tier column */}
                                        {uniqueFormsTiers.map((formsTier) => {
                                            const formsKey    = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                                            const record      = recordGrid.get(standeeKey)?.get(formsKey);
                                            const costEdited  = record && editedCosts[record._id] !== undefined && editedCosts[record._id] !== record.packout;
                                            return (
                                                <td key={formsKey} className="px-2 py-1.5 align-middle">
                                                    {record ? (
                                                        <div className="relative">
                                                            {costEdited && (
                                                                <span className="absolute -top-3.5 left-0 text-[8px] text-[#FFB604] font-bold leading-none">CHANGED</span>
                                                            )}
                                                            <div className={`flex items-center border-2 rounded-md transition-colors focus-within:border-[#FFB604] ${costEdited ? "border-[#FFE08A]" : "border-[#EDEAEA]"}`}>
                                                                <span className="pl-2 text-[#B1B3B6] select-none">$</span>
                                                                <input
                                                                    type="number" min={0} step={1}
                                                                    value={getDisplayCost(record)}
                                                                    onChange={(e) => updateCostEdit(record._id, e.target.value)}
                                                                    className="w-full p-1.5 outline-none text-black text-xs bg-transparent"
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="relative">
                                                            {!!missingCellEdits[missingCellKey(standeeKey, formsKey)] && (
                                                                <span className="absolute -top-3.5 left-0 text-[8px] text-[#FFB604] font-bold leading-none">NEW</span>
                                                            )}
                                                            <div className={`flex items-center border-2 rounded-md transition-colors focus-within:border-[#FFB604] ${
                                                                missingCellEdits[missingCellKey(standeeKey, formsKey)] ? "border-[#FFE08A]" : "border-dashed border-[#EDEAEA]"
                                                            }`}>
                                                                <span className="pl-2 text-[#B1B3B6] select-none">$</span>
                                                                <input
                                                                    type="number" min={0} step={1}
                                                                    placeholder="—"
                                                                    value={missingCellEdits[missingCellKey(standeeKey, formsKey)] ?? ""}
                                                                    onChange={(e) => updateMissingCellEdit(standeeKey, formsKey, e.target.value)}
                                                                    className="w-full p-1.5 outline-none text-black text-xs bg-transparent"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}

                                        {/* Delete button — only visible on row hover */}
                                        <td className="py-1.5 pl-1 align-middle">
                                            <button
                                                onClick={() => setPendingDeletionIds(recordIdsInRow)}
                                                className="h-[32px] w-[32px] text-xs font-bold border-2 border-transparent rounded-md text-[#DEDEDE] hover:border-red-200 hover:text-red-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Unsaved new row drafts */}
                            {newRowDrafts.map((draft, rowIndex) => (
                                <tr key={`new-row-${rowIndex}`}>
                                    {/* Standee range inputs for the new row */}
                                    <td className="pr-6 py-1.5 align-middle">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[8px] text-[#FFB604] font-bold leading-none">NEW</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min={0} step={1}
                                                    placeholder="lb"
                                                    value={draft.standeesLower}
                                                    onChange={(e) => updateNewRowBound(rowIndex, "standeesLower", e.target.value)}
                                                    className="border-2 border-[#FFB604] rounded-md w-[44px] p-1.5 outline-none text-black text-xs"
                                                />
                                                <span className="text-[#B1B3B6]">–</span>
                                                <input
                                                    type="number" min={0} step={1}
                                                    placeholder="∞"
                                                    value={draft.standeesUpper}
                                                    onChange={(e) => updateNewRowBound(rowIndex, "standeesUpper", e.target.value)}
                                                    className="border-2 border-[#FFB604] rounded-md w-[44px] p-1.5 outline-none text-black text-xs"
                                                />
                                            </div>
                                        </div>
                                    </td>

                                    {/* One cost input per forms tier column for the new row */}
                                    {uniqueFormsTiers.map((formsTier) => {
                                        const formsKey = buildRangeKey(formsTier.lowerBound, formsTier.upperBound);
                                        return (
                                            <td key={formsKey} className="px-2 py-1.5 align-middle">
                                                <div className="flex items-center border-2 border-[#FFB604] rounded-md">
                                                    <span className="pl-2 text-[#B1B3B6] select-none">$</span>
                                                    <input
                                                        type="number" min={0} step={1}
                                                        value={draft.costByFormsKey[formsKey]}
                                                        onChange={(e) => updateNewRowCost(rowIndex, formsKey, e.target.value)}
                                                        className="w-full p-1.5 outline-none text-black text-xs bg-transparent"
                                                    />
                                                </div>
                                            </td>
                                        );
                                    })}

                                    <td className="py-1.5 pl-1 align-middle">
                                        <button
                                            onClick={() => removeNewRowDraft(rowIndex)}
                                            className="h-[32px] w-[32px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors cursor-pointer"
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <button
                    onClick={addNewRowDraft}
                    className="mt-4 cursor-pointer px-4 h-[34px] text-xs font-bold border-2 border-dashed border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-[#FFB604] hover:text-[#FFB604] transition-colors"
                >
                    + ADD ROW
                </button>
            </div>

            <ModuleFooter
                isDirty={hasUnsavedChanges}
                isSaving={isSaving}
                secondaryLabel="HISTORY"
                onSecondaryAction={() => setHistoryOpen(true)}
                onSubmit={() => void saveChanges()}
            />

            <DataCollectorHistoryModal
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                title="Packout History"
                fetchUrl="/packout/history"
            />
        </>
    );
}
