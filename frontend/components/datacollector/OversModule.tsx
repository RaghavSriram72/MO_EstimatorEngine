"use client";
import { useState, useEffect } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";
import ModuleFooter from "./ModuleFooter";
import {
    API_BASE, OversRecord, OversEditFields, PendingOversRow,
    formatDate,
} from "./shared";

export default function OversModule() {
    const [savedTiers, setSavedTiers]           = useState<OversRecord[]>([]);
    // editBuffer maps tier _id → the locally edited values (not yet submitted)
    const [editBuffer, setEditBuffer]           = useState<Record<string, OversEditFields> | null>(null);
    const [pendingNewRows, setPendingNewRows]   = useState<PendingOversRow[]>([]);
    const [tierToDelete, setTierToDelete]       = useState<string | null>(null);
    const [isLoading, setIsLoading]             = useState(false);
    const [isSaving, setIsSaving]               = useState(false);

    // GET /overs → load all quantity tiers when module mounts
    useEffect(() => {
        setIsLoading(true);
        fetch(`${API_BASE}/overs`)
            .then((r) => r.json())
            .then((data) => {
                const tiers: OversRecord[] = data.data ?? [];
                setSavedTiers(tiers);
                setEditBuffer(buildEditBuffer(tiers));
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    function buildEditBuffer(tiers: OversRecord[]): Record<string, OversEditFields> {
        const buf: Record<string, OversEditFields> = {};
        tiers.forEach((t) => {
            buf[t._id] = { lower_bound: t.lower_bound, upper_bound: t.upper_bound, overs: t.overs };
        });
        return buf;
    }

    function updateExistingTier(id: string, field: keyof OversEditFields, value: string) {
        setEditBuffer((prev) => {
            if (!prev) return null;
            const current = prev[id];
            if (field === "upper_bound") {
                return { ...prev, [id]: { ...current, upper_bound: value === "" ? null : parseInt(value) } };
            }
            return { ...prev, [id]: { ...current, [field]: parseInt(value) || 0 } };
        });
    }

    function addNewRow() {
        setPendingNewRows((prev) => [...prev, { lower_bound: "", upper_bound: "", overs: "" }]);
    }

    function updateNewRow(index: number, field: keyof PendingOversRow, value: string) {
        setPendingNewRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    }

    function removeNewRow(index: number) {
        setPendingNewRows((prev) => prev.filter((_, i) => i !== index));
    }

    // True if any saved tier has been edited OR there are pending new rows waiting to be submitted
    const hasUnsavedChanges =
        (!!editBuffer && savedTiers.some((t) => {
            const e = editBuffer[t._id];
            return e && (e.lower_bound !== t.lower_bound || e.upper_bound !== t.upper_bound || e.overs !== t.overs);
        })) || pendingNewRows.length > 0;

    async function reloadTiers() {
        const data = await fetch(`${API_BASE}/overs`).then((r) => r.json());
        const updated: OversRecord[] = data.data ?? [];
        setSavedTiers(updated);
        setEditBuffer(buildEditBuffer(updated));
    }

    async function saveChanges() {
        if (!hasUnsavedChanges) return;
        setIsSaving(true);
        try {
            // PATCH /overs/:id for each tier whose values changed
            const patches = editBuffer
                ? savedTiers
                    .filter((t) => {
                        const e = editBuffer[t._id];
                        return e && (e.lower_bound !== t.lower_bound || e.upper_bound !== t.upper_bound || e.overs !== t.overs);
                    })
                    .map((t) =>
                        fetch(`${API_BASE}/overs/${t._id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(editBuffer[t._id]),
                        }),
                    )
                : [];

            // POST /overs for each fully-filled pending new row
            const posts = pendingNewRows
                .filter((row) => row.lower_bound !== "" && row.overs !== "")
                .map((row) =>
                    fetch(`${API_BASE}/overs`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            lower_bound: parseInt(row.lower_bound),
                            upper_bound: row.upper_bound === "" ? null : parseInt(row.upper_bound),
                            overs: parseInt(row.overs),
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
            // DELETE /overs/:id → permanently removes the tier
            await fetch(`${API_BASE}/overs/${id}`, { method: "DELETE" });
            await reloadTiers();
        } catch (e) { console.error(e); }
    }

    function resetAllEdits() {
        setEditBuffer(buildEditBuffer(savedTiers));
        setPendingNewRows([]);
    }

    return (
        <>
            <ConfirmAlert
                visible={tierToDelete !== null}
                message="Delete this overs tier? This cannot be undone."
                onConfirm={() => void confirmDeleteTier()}
                onCancel={() => setTierToDelete(null)}
            />

            {/* 01 — summary header */}
            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — QUANTITY TIERS</div>
                {isLoading ? (
                    <div className="text-xs m-2">Loading records...</div>
                ) : (
                    <div className="text-xs m-2 text-[#ABABAB]">
                        {savedTiers.length} tiers loaded. Leave Upper Bound blank for an open-ended tier.
                    </div>
                )}
            </div>

            {/* 02 — editable tier rows + new row drafts */}
            <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                <div className="flex items-center gap-2 m-2">
                    <span className="text-[10px]">02 — TIER VALUES</span>
                    {hasUnsavedChanges && (
                        <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                            Unsaved Changes
                        </span>
                    )}
                </div>

                {isLoading ? (
                    <div className="text-xs m-2">Loading...</div>
                ) : (savedTiers.length > 0 && editBuffer) || pendingNewRows.length > 0 ? (
                    <>
                        {/* Column headers */}
                        <div className="flex flex-row gap-3 w-full mb-1 px-1">
                            <div className="text-[9px] flex-1 font-bold tracking-wider">LOWER BOUND</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">UPPER BOUND</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">OVERS (%)</div>
                            <div className="text-[9px] w-[120px] shrink-0 font-bold tracking-wider">LAST UPDATED</div>
                            <div className="w-[34px] shrink-0" />
                        </div>

                        <div className="w-full flex flex-col gap-2">
                            {/* Existing saved tiers */}
                            {savedTiers.map((tier) => {
                                const edit = editBuffer?.[tier._id];
                                if (!edit) return null;
                                const lbChanged = edit.lower_bound !== tier.lower_bound;
                                const ubChanged = edit.upper_bound !== tier.upper_bound;
                                const ovChanged = edit.overs !== tier.overs;
                                return (
                                    <div key={tier._id} className="flex flex-row items-center gap-3">
                                        <div className="flex flex-col flex-1">
                                            {lbChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.lower_bound}
                                                onChange={(e) => updateExistingTier(tier._id, "lower_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {ubChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                placeholder="∞"
                                                value={edit.upper_bound ?? ""}
                                                onChange={(e) => updateExistingTier(tier._id, "upper_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {ovChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.overs}
                                                onChange={(e) => updateExistingTier(tier._id, "overs", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex justify-center items-center p-2 border-2 w-[120px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                            <div className="text-[0.75em] font-instrument text-black">{formatDate(tier.last_updated)}</div>
                                        </div>
                                        <button
                                            onClick={() => setTierToDelete(tier._id)}
                                            className="shrink-0 h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors"
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
                                            value={row.lower_bound}
                                            onChange={(e) => updateNewRow(idx, "lower_bound", e.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">NEW</span>
                                        <input
                                            type="number" min={0} step={1}
                                            placeholder="∞"
                                            value={row.upper_bound}
                                            onChange={(e) => updateNewRow(idx, "upper_bound", e.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">NEW</span>
                                        <input
                                            type="number" min={0} step={1}
                                            value={row.overs}
                                            onChange={(e) => updateNewRow(idx, "overs", e.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                        />
                                    </div>
                                    <div className="flex justify-center items-center p-2 border-2 w-[120px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                        <div className="text-[0.75em] font-instrument text-black">—</div>
                                    </div>
                                    <button
                                        onClick={() => removeNewRow(idx)}
                                        className="shrink-0 h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors"
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
                        <div className="text-xs text-[#ABABAB]">No overs records found.</div>
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
                onClear={resetAllEdits}
                onSubmit={() => void saveChanges()}
            />
        </>
    );
}
