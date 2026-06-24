"use client";
import { useState, useEffect } from "react";
import EditableValueBox from "@/components/EditableValueBox";
import ModuleFooter from "./ModuleFooter";
import {
    API_BASE, StandeeRecord,
    STANDEE_TYPES, formatFieldLabel, standeeNumericFields,
} from "./shared";

export default function StandeeModule() {
    const [standeeType, setStandeeType]     = useState("Simple Standee");
    const [savedRecord, setSavedRecord]     = useState<StandeeRecord | null>(null);
    const [editedFields, setEditedFields]   = useState<Record<string, number> | null>(null);
    const [isLoading, setIsLoading]         = useState(false);
    const [isSaving, setIsSaving]           = useState(false);

    // GET /standee-static-costs?standee_type=... → load when a type is selected
    useEffect(() => {
        if (!standeeType) return;
        setIsLoading(true);
        setSavedRecord(null);
        setEditedFields(null);
        fetch(`${API_BASE}/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`)
            .then((r) => r.json())
            .then((data) => {
                const rec: StandeeRecord = data.data;
                setSavedRecord(rec);
                const edits: Record<string, number> = {};
                standeeNumericFields(rec).forEach(([k, v]) => { edits[k] = v; });
                setEditedFields(edits);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [standeeType]);

    function updateField(field: string, value: string) {
        setEditedFields((prev) => prev ? { ...prev, [field]: parseFloat(value) || 0 } : null);
    }

    const hasUnsavedChanges =
        !!savedRecord && !!editedFields &&
        standeeNumericFields(savedRecord).some(([k, v]) => editedFields[k] !== v);

    async function saveChanges() {
        if (!savedRecord || !editedFields || !hasUnsavedChanges) return;
        const changedFields: Record<string, number> = {};
        standeeNumericFields(savedRecord).forEach(([k, v]) => {
            if (editedFields[k] !== v) changedFields[k] = editedFields[k];
        });
        setIsSaving(true);
        try {
            // PATCH /standee-static-costs?standee_type=... → save changed numeric fields
            await fetch(
                `${API_BASE}/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ updates: changedFields }),
                },
            );
            // GET /standee-static-costs?standee_type=... → reload to confirm saved values
            const data = await fetch(
                `${API_BASE}/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`,
            ).then((r) => r.json());
            const updated: StandeeRecord = data.data;
            setSavedRecord(updated);
            const edits: Record<string, number> = {};
            standeeNumericFields(updated).forEach(([k, v]) => { edits[k] = v; });
            setEditedFields(edits);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    function clearSelections() {
        setStandeeType("");
        setSavedRecord(null);
        setEditedFields(null);
    }

    return (
        <>
            {/* 01 — pick standee type */}
            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — STANDEE TYPE SELECTION</div>
                <div className="flex flex-row gap-2 ml-2">
                    {STANDEE_TYPES.map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setStandeeType(t)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-colors cursor-pointer ${
                                standeeType === t
                                    ? "bg-[#FFC843] border-[#FFC843] text-[#000005]"
                                    : "border-[#EDEAEA] text-[#ABABAB] hover:border-[#FFC843] hover:text-[#000005]"
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* 02 — editable cost fields; click any box to edit inline */}
            <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                <div className="flex items-center gap-2 m-2">
                    <span className="text-[10px]">02 — VALUES</span>
                    {editedFields && (
                        <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                            Click Any Value to Edit
                        </span>
                    )}
                </div>
                {isLoading ? (
                    <div className="text-xs m-2">Loading...</div>
                ) : editedFields && savedRecord ? (
                    <div className="w-full grid grid-cols-3 gap-2">
                        {standeeNumericFields(savedRecord).map(([key, originalValue]) => (
                            <EditableValueBox
                                key={key}
                                label={formatFieldLabel(key)}
                                value={editedFields[key]}
                                originalValue={originalValue}
                                onChange={(val) => updateField(key, val)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-xs m-2">Select a standee type above to edit values.</div>
                )}
            </div>

            <ModuleFooter
                isDirty={hasUnsavedChanges}
                isSaving={isSaving}
                onClear={clearSelections}
                onSubmit={() => void saveChanges()}
            />
        </>
    );
}
