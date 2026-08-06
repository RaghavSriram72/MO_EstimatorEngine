"use client";
import { useState, useEffect } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";
import ModuleFooter from "./ModuleFooter";
import DataCollectorHistoryModal from "./DataCollectorHistoryModal";
import {
    API_BASE, PackoutRecord, PackoutEditFields, PendingPackoutRow,
    formatDate,
} from "./shared";

const COMPLEXITIES = ["Simple", "Moderate", "Complex"] as const;
type Complexity = typeof COMPLEXITIES[number];

export default function PackoutModule() {
    const [savedTiers, setSavedTiers]           = useState<PackoutRecord[]>([]);
    // editBuffer maps tier _id → the locally edited values (not yet submitted)
    const [editBuffer, setEditBuffer]           = useState<Record<string, PackoutEditFields> | null>(null);
    const [pendingNewRows, setPendingNewRows]   = useState<PendingPackoutRow[]>([]);
    const [activeComplexity, setActiveComplexity] = useState<Complexity>("Simple");
    const [tierToDelete, setTierToDelete]       = useState<string | null>(null);
    const [isLoading, setIsLoading]             = useState(false);
    const [isSaving, setIsSaving]               = useState(false);
    const [historyOpen, setHistoryOpen]         = useState(false);

    // GET /packout → load all standee tiers when module mounts
    useEffect(() => {
        setIsLoading(true);
        fetch(`${API_BASE}/packout`)
            .then((r) => r.json())
            .then((data) => {
                const tiers: PackoutRecord[] = data.data ?? [];
                setSavedTiers(tiers);
                setEditBuffer(buildEditBuffer(tiers));
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    function buildEditBuffer(tiers: PackoutRecord[]): Record<string, PackoutEditFields> {
        const buf: Record<string, PackoutEditFields> = {};
        tiers.forEach((t) => {
            buf[t._id] = {
                standees_lower_bound: t.standees_lower_bound,
                standees_upper_bound: t.standees_upper_bound,
                packout: t.packout,
            };
        });
        return buf;
    }

    // Only the tiers that belong to whichever complexity tab is currently active
    const tiersForActiveComplexity = savedTiers.filter(
        (tier) => tier.complexity.toLowerCase() === activeComplexity.toLowerCase(),
    );

    function updateExistingTier(id: string, field: keyof PackoutEditFields, value: string) {
        setEditBuffer((prev) => {
            if (!prev) return null;
            const current = prev[id];
            if (field === "standees_upper_bound") {
                return { ...prev, [id]: { ...current, standees_upper_bound: value === "" ? null : parseInt(value) } };
            }
            return { ...prev, [id]: { ...current, [field]: parseInt(value) || 0 } };
        });
    }

    function addNewRow() {
        setPendingNewRows((prev) => [...prev, { standees_lower_bound: "", standees_upper_bound: "", packout: "" }]);
    }

    function updateNewRow(index: number, field: keyof PendingPackoutRow, value: string) {
        setPendingNewRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    }

    function removeNewRow(index: number) {
        setPendingNewRows((prev) => prev.filter((_, i) => i !== index));
    }

    // True if any saved tier has been edited OR there are pending new rows waiting to be submitted
    const hasUnsavedChanges =
        (!!editBuffer && tiersForActiveComplexity.some((t) => {
            const e = editBuffer[t._id];
            return e && (
                e.standees_lower_bound !== t.standees_lower_bound ||
                e.standees_upper_bound !== t.standees_upper_bound ||
                e.packout !== t.packout
            );
        })) || pendingNewRows.length > 0;

    async function reloadTiers() {
        const data = await fetch(`${API_BASE}/packout`).then((r) => r.json());
        const updated: PackoutRecord[] = data.data ?? [];
        setSavedTiers(updated);
        setEditBuffer(buildEditBuffer(updated));
    }

    async function saveChanges() {
        if (!hasUnsavedChanges) return;
        setIsSaving(true);
        try {
            const changedBy = localStorage.getItem("username") ?? "";
            // PATCH /packout/:id for each tier whose values changed
            const patches = editBuffer
                ? tiersForActiveComplexity
                    .filter((t) => {
                        const e = editBuffer[t._id];
                        return e && (
                            e.standees_lower_bound !== t.standees_lower_bound ||
                            e.standees_upper_bound !== t.standees_upper_bound ||
                            e.packout !== t.packout
                        );
                    })
                    .map((t) =>
                        fetch(`${API_BASE}/packout/${t._id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...editBuffer[t._id], complexity: activeComplexity, changed_by: changedBy }),
                        }),
                    )
                : [];

            // POST /packout for each fully-filled pending new row
            const posts = pendingNewRows
                .filter((row) => row.standees_lower_bound !== "" && row.packout !== "")
                .map((row) =>
                    fetch(`${API_BASE}/packout`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            standees_lower_bound: parseInt(row.standees_lower_bound),
                            standees_upper_bound: row.standees_upper_bound === "" ? null : parseInt(row.standees_upper_bound),
                            complexity: activeComplexity,
                            packout: parseInt(row.packout),
                            changed_by: changedBy,
                        }),
                    }),
                );

            await Promise.all([...patches, ...posts]);
            await reloadTiers();
            setPendingNewRows([]);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    async function confirmDeleteTier() {
        if (!tierToDelete) return;
        const id = tierToDelete;
        setTierToDelete(null);
        try {
            const changedBy = localStorage.getItem("username") ?? "";
            // DELETE /packout/:id → permanently removes the tier
            await fetch(`${API_BASE}/packout/${id}?changed_by=${encodeURIComponent(changedBy)}`, { method: "DELETE" });
            await reloadTiers();
        } catch (e) { console.error(e); }
    }

    return (
        <>
            <ConfirmAlert
                visible={tierToDelete !== null}
                message="Delete this packout tier? This cannot be undone."
                onConfirm={() => void confirmDeleteTier()}
                onCancel={() => setTierToDelete(null)}
            />

            {/* 01 — Complexity filter: determines which subset of tiers is shown below */}
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

            {/* 02 — editable tier rows + new row drafts */}
            <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                <div className="flex items-center gap-2 m-2">
                    <span className="text-[10px]">02 — STANDEE TIERS</span>
                    {hasUnsavedChanges && (
                        <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                            Unsaved Changes
                        </span>
                    )}
                </div>

                {isLoading ? (
                    <div className="text-xs m-2">Loading...</div>
                ) : (tiersForActiveComplexity.length > 0 && editBuffer) || pendingNewRows.length > 0 ? (
                    <>
                        {/* Column headers */}
                        <div className="flex flex-row gap-3 w-full mb-1 px-1">
                            <div className="text-[9px] flex-1 font-bold tracking-wider">STANDEES LOWER BOUND</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">STANDEES UPPER BOUND</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">PACKOUT ($)</div>
                            <div className="text-[9px] w-[120px] shrink-0 font-bold tracking-wider">LAST UPDATED</div>
                            <div className="w-[34px] shrink-0" />
                        </div>

                        <div className="w-full flex flex-col gap-2">
                            {/* Existing saved tiers */}
                            {tiersForActiveComplexity.map((tier) => {
                                const edit = editBuffer?.[tier._id];
                                if (!edit) return null;
                                const lbChanged = edit.standees_lower_bound !== tier.standees_lower_bound;
                                const ubChanged = edit.standees_upper_bound !== tier.standees_upper_bound;
                                const pkChanged = edit.packout !== tier.packout;
                                return (
                                    <div key={tier._id} className="flex flex-row items-center gap-3">
                                        <div className="flex flex-col flex-1">
                                            {lbChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.standees_lower_bound}
                                                onChange={(e) => updateExistingTier(tier._id, "standees_lower_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {ubChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                placeholder="∞"
                                                value={edit.standees_upper_bound ?? ""}
                                                onChange={(e) => updateExistingTier(tier._id, "standees_upper_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {pkChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.packout}
                                                onChange={(e) => updateExistingTier(tier._id, "packout", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex justify-center items-center p-2 border-2 w-[120px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                            <div className="text-[0.75em] font-instrument text-black">{formatDate(tier.last_updated)}</div>
                                        </div>
                                        <button
                                            onClick={() => setTierToDelete(tier._id)}
                                            className="cursor-pointer shrink-0 h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Draft rows that haven't been submitted yet */}
                            {pendingNewRows.map((row, idx) => (
                                <div key={`new-${idx}`} className="flex flex-row items-center gap-3">
                                    <div className="flex flex-col flex-1">
                                        <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">NEW</span>
                                        <input
                                            type="number" min={0} step={1}
                                            value={row.standees_lower_bound}
                                            onChange={(e) => updateNewRow(idx, "standees_lower_bound", e.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">NEW</span>
                                        <input
                                            type="number" min={0} step={1}
                                            placeholder="∞"
                                            value={row.standees_upper_bound}
                                            onChange={(e) => updateNewRow(idx, "standees_upper_bound", e.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">NEW</span>
                                        <input
                                            type="number" min={0} step={1}
                                            value={row.packout}
                                            onChange={(e) => updateNewRow(idx, "packout", e.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                        />
                                    </div>
                                    <div className="flex justify-center items-center p-2 border-2 w-[120px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                        <div className="text-[0.75em] font-instrument text-black">—</div>
                                    </div>
                                    <button
                                        onClick={() => removeNewRow(idx)}
                                        className="cursor-pointer shrink-0 h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addNewRow}
                            className="mt-2 cursor-pointer px-4 h-[34px] text-xs font-bold border-2 border-dashed border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-[#FFB604] hover:text-[#FFB604] transition-colors"
                        >
                            + ADD ROW
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col gap-2 m-2">
                        <div className="text-xs text-[#ABABAB]">No packout records found for this complexity.</div>
                        <button
                            onClick={addNewRow}
                            className="self-start cursor-pointer px-4 h-[34px] text-xs font-bold border-2 border-dashed border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-[#FFB604] hover:text-[#FFB604] transition-colors"
                        >
                            + ADD ROW
                        </button>
                    </div>
                )}
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
