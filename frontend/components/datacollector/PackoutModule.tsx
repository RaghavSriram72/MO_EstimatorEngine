"use client";
import { useState, useEffect } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";
import ModuleFooter from "./ModuleFooter";
import {
    API_BASE, PackoutRecord, PackoutEditFields, PendingPackoutRow,
    formatDate,
} from "./shared";

const COMPLEXITIES = ["Simple", "Moderate", "Complex"] as const;
type Complexity = typeof COMPLEXITIES[number];

export default function PackoutModule() {
    const [savedTiers, setSavedTiers]         = useState<PackoutRecord[]>([]);
    const [editBuffer, setEditBuffer]         = useState<Record<string, PackoutEditFields> | null>(null);
    const [pendingNewRows, setPendingNewRows] = useState<PendingPackoutRow[]>([]);
    const [activeComplexity, setActiveComplexity] = useState<Complexity>("Simple");
    const [tierToDelete, setTierToDelete]     = useState<string | null>(null);
    const [isLoading, setIsLoading]           = useState(false);
    const [isSaving, setIsSaving]             = useState(false);

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
                forms_lower_bound: t.forms_lower_bound,
                forms_upper_bound: t.forms_upper_bound,
                complexity: t.complexity,
                packout: t.packout,
            };
        });
        return buf;
    }

    function updateExistingTier(id: string, field: keyof PackoutEditFields, value: string) {
        setEditBuffer((prev) => {
            if (!prev) return null;
            const current = prev[id];
            const nullableFields: (keyof PackoutEditFields)[] = ["standees_upper_bound", "forms_upper_bound"];
            const stringFields: (keyof PackoutEditFields)[] = ["complexity"];
            if (nullableFields.includes(field)) {
                return { ...prev, [id]: { ...current, [field]: value === "" ? null : parseInt(value) } };
            }
            if (stringFields.includes(field)) {
                return { ...prev, [id]: { ...current, [field]: value } };
            }
            return { ...prev, [id]: { ...current, [field]: parseInt(value) || 0 } };
        });
    }

    function addNewRow() {
        setPendingNewRows((prev) => [
            ...prev,
            {
                standees_lower_bound: "",
                standees_upper_bound: "",
                forms_lower_bound: "",
                forms_upper_bound: "",
                complexity: activeComplexity,
                packout: "",
            },
        ]);
    }

    function updateNewRow(index: number, field: keyof PendingPackoutRow, value: string) {
        setPendingNewRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    }

    function removeNewRow(index: number) {
        setPendingNewRows((prev) => prev.filter((_, i) => i !== index));
    }

    function tierChanged(t: PackoutRecord): boolean {
        const e = editBuffer?.[t._id];
        if (!e) return false;
        return (
            e.standees_lower_bound !== t.standees_lower_bound ||
            e.standees_upper_bound !== t.standees_upper_bound ||
            e.forms_lower_bound !== t.forms_lower_bound ||
            e.forms_upper_bound !== t.forms_upper_bound ||
            e.complexity !== t.complexity ||
            e.packout !== t.packout
        );
    }

    const hasUnsavedChanges =
        (!!editBuffer && savedTiers.some(tierChanged)) || pendingNewRows.length > 0;

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
            const patches = editBuffer
                ? savedTiers.filter(tierChanged).map((t) =>
                    fetch(`${API_BASE}/packout/${t._id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(editBuffer[t._id]),
                    }),
                )
                : [];

            const posts = pendingNewRows
                .filter((row) => row.standees_lower_bound !== "" && row.forms_lower_bound !== "" && row.packout !== "")
                .map((row) =>
                    fetch(`${API_BASE}/packout`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            standees_lower_bound: parseInt(row.standees_lower_bound),
                            standees_upper_bound: row.standees_upper_bound === "" ? null : parseInt(row.standees_upper_bound),
                            forms_lower_bound: parseInt(row.forms_lower_bound),
                            forms_upper_bound: row.forms_upper_bound === "" ? null : parseInt(row.forms_upper_bound),
                            complexity: row.complexity,
                            packout: parseInt(row.packout),
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
            await fetch(`${API_BASE}/packout/${id}`, { method: "DELETE" });
            await reloadTiers();
        } catch (e) { console.error(e); }
    }

    function resetAllEdits() {
        setEditBuffer(buildEditBuffer(savedTiers));
        setPendingNewRows([]);
    }

    const visibleTiers = savedTiers.filter(
        (t) => t.complexity.toLowerCase() === activeComplexity.toLowerCase(),
    );
    const visiblePending = pendingNewRows
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => row.complexity === activeComplexity);

    return (
        <>
            <ConfirmAlert
                visible={tierToDelete !== null}
                message="Delete this packout tier? This cannot be undone."
                onConfirm={() => void confirmDeleteTier()}
                onCancel={() => setTierToDelete(null)}
            />

            {/* 01 — complexity filter */}
            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — COMPLEXITY FILTER</div>
                <div className="flex flex-row gap-2 ml-2">
                    {COMPLEXITIES.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setActiveComplexity(c)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-colors cursor-pointer ${
                                activeComplexity === c
                                    ? "bg-[#FFC843] border-[#FFC843] text-[#000005]"
                                    : "border-[#EDEAEA] text-[#ABABAB] hover:border-[#FFC843] hover:text-[#000005]"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* 02 — tier table */}
            <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                <div className="flex items-center gap-2 m-2">
                    <span className="text-[10px]">02 — TIER VALUES</span>
                    {hasUnsavedChanges && (
                        <span className="text-[10px] font-bold text-[#FFB604] tracking-wide">
                            Unsaved Changes
                        </span>
                    )}
                </div>

                {isLoading ? (
                    <div className="text-xs m-2">Loading...</div>
                ) : (
                    <>
                        {/* Column headers */}
                        <div className="flex flex-row gap-2 w-full mb-1 px-1">
                            <div className="text-[9px] flex-1 font-bold tracking-wider">FORMS LOWER</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">FORMS UPPER</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">STANDEES LOWER</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">STANDEES UPPER</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">COST ($)</div>
                            <div className="text-[9px] w-[100px] shrink-0 font-bold tracking-wider">LAST UPDATED</div>
                            <div className="w-[34px] shrink-0" />
                        </div>

                        <div className="w-full flex flex-col gap-2">
                            {/* Existing saved tiers for this complexity */}
                            {visibleTiers.map((tier) => {
                                const edit = editBuffer?.[tier._id];
                                if (!edit) return null;
                                const slbChanged = edit.standees_lower_bound !== tier.standees_lower_bound;
                                const subChanged = edit.standees_upper_bound !== tier.standees_upper_bound;
                                const flbChanged = edit.forms_lower_bound !== tier.forms_lower_bound;
                                const fubChanged = edit.forms_upper_bound !== tier.forms_upper_bound;
                                const costChanged = edit.packout !== tier.packout;
                                return (
                                    <div key={tier._id} className="flex flex-row items-center gap-2">
                                        <div className="flex flex-col flex-1">
                                            {flbChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.forms_lower_bound}
                                                onChange={(e) => updateExistingTier(tier._id, "forms_lower_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {fubChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                placeholder="∞"
                                                value={edit.forms_upper_bound ?? ""}
                                                onChange={(e) => updateExistingTier(tier._id, "forms_upper_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {slbChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.standees_lower_bound}
                                                onChange={(e) => updateExistingTier(tier._id, "standees_lower_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {subChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                placeholder="∞"
                                                value={edit.standees_upper_bound ?? ""}
                                                onChange={(e) => updateExistingTier(tier._id, "standees_upper_bound", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {costChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                            <input
                                                type="number" min={0} step={1}
                                                value={edit.packout}
                                                onChange={(e) => updateExistingTier(tier._id, "packout", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex justify-center items-center p-2 border-2 w-[100px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                            <div className="text-[0.72em] font-instrument text-black">{formatDate(tier.last_updated)}</div>
                                        </div>
                                        <button
                                            onClick={() => setTierToDelete(tier._id)}
                                            className="shrink-0 h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors cursor-pointer"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Draft new rows for this complexity */}
                            {visiblePending.map(({ row, idx }) => (
                                <div key={`new-${idx}`} className="flex flex-row items-center gap-2">
                                    {(["forms_lower_bound", "forms_upper_bound", "standees_lower_bound", "standees_upper_bound", "packout"] as const).map((field) => (
                                        <div key={field} className="flex flex-col flex-1">
                                            <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">NEW</span>
                                            <input
                                                type="number" min={0} step={1}
                                                placeholder={field.includes("upper") ? "∞" : undefined}
                                                value={row[field]}
                                                onChange={(e) => updateNewRow(idx, field, e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                    ))}
                                    <div className="flex justify-center items-center p-2 border-2 w-[100px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                        <div className="text-[0.72em] font-instrument text-black">—</div>
                                    </div>
                                    <button
                                        onClick={() => removeNewRow(idx)}
                                        className="shrink-0 h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addNewRow}
                            className="mt-3 cursor-pointer px-4 h-[34px] text-xs font-bold border-2 border-dashed border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-[#FFB604] hover:text-[#FFB604] transition-colors"
                        >
                            + ADD ROW
                        </button>
                    </>
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
