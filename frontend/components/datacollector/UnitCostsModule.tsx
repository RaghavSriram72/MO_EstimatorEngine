"use client";
import { useState, useEffect } from "react";
import Dropdown from "@/components/Dropdown";
import ModuleFooter from "./ModuleFooter";
import DataCollectorHistoryModal from "./DataCollectorHistoryModal";
import {
    API_BASE, UnitCostRecord, UnitEditFields,
    unitTypeLabel, formatDate,
} from "./shared";

export default function UnitCostsModule() {
    const [allRecords, setAllRecords]       = useState<UnitCostRecord[]>([]);
    const [selectedType, setSelectedType]   = useState("");
    const [selectedName, setSelectedName]   = useState("");
    const [editedFields, setEditedFields]   = useState<UnitEditFields | null>(null);
    const [isLoading, setIsLoading]         = useState(false);
    const [isSaving, setIsSaving]           = useState(false);
    const [historyOpen, setHistoryOpen]     = useState(false);

    // GET /unit-costs → load all records when the module mounts
    useEffect(() => {
        setIsLoading(true);
        fetch(`${API_BASE}/unit-costs`)
            .then((r) => r.json())
            .then((data) => setAllRecords(data.data ?? []))
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    const uniqueTypes          = [...new Set(allRecords.map((r) => r.type))].sort();
    const recordsForType       = selectedType ? allRecords.filter((r) => r.type === selectedType) : [];
    const savedRecord          = allRecords.find((r) => r.name === selectedName) ?? null;

    function selectType(type: string) {
        setSelectedType(type);
        setSelectedName("");
        setEditedFields(null);
    }

    function selectRecord(displayName: string) {
        const rec = recordsForType.find((r) => r.display_name === displayName);
        if (!rec) return;
        setSelectedName(rec.name);
        setEditedFields({
            display_name: rec.display_name,
            cost: rec.cost,
            unit: rec.unit,
            type: rec.type,
            ...(rec.type === "machine" ? {
                throughput: rec.throughput ?? 0,
                throughput_unit: rec.throughput_unit ?? "linear_foot",
            } : {}),
        });
    }

    const numericFields = new Set<keyof UnitEditFields>(["cost", "throughput"]);

    function updateField(field: keyof UnitEditFields, value: string) {
        setEditedFields((prev) =>
            prev ? { ...prev, [field]: numericFields.has(field) ? parseFloat(value) || 0 : value } : null,
        );
    }

    const hasUnsavedChanges =
        !!savedRecord && !!editedFields &&
        (editedFields.cost !== savedRecord.cost ||
            editedFields.unit !== savedRecord.unit ||
            editedFields.type !== savedRecord.type ||
            editedFields.display_name !== savedRecord.display_name ||
            editedFields.throughput !== savedRecord.throughput ||
            (editedFields.throughput_unit ?? "linear_foot") !== (savedRecord.throughput_unit ?? "linear_foot"));

    async function saveChanges() {
        if (!savedRecord || !editedFields || !hasUnsavedChanges) return;
        const changedFields: Partial<UnitEditFields> = {};
        if (editedFields.cost !== savedRecord.cost) changedFields.cost = editedFields.cost;
        if (editedFields.unit !== savedRecord.unit) changedFields.unit = editedFields.unit;
        if (editedFields.type !== savedRecord.type) changedFields.type = editedFields.type;
        if (editedFields.display_name !== savedRecord.display_name) changedFields.display_name = editedFields.display_name;
        if (editedFields.throughput !== undefined && editedFields.throughput !== savedRecord.throughput) changedFields.throughput = editedFields.throughput;
        if (editedFields.throughput_unit !== undefined && editedFields.throughput_unit !== savedRecord.throughput_unit) changedFields.throughput_unit = editedFields.throughput_unit;
        setIsSaving(true);
        try {
            const changedBy = localStorage.getItem("username") ?? "";
            // PATCH /unit-costs/:name → save only the changed fields
            await fetch(`${API_BASE}/unit-costs/${savedRecord.name}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...changedFields, changed_by: changedBy }),
            });
            // GET /unit-costs → reload to reflect the new last_updated timestamp
            const data = await fetch(`${API_BASE}/unit-costs`).then((r) => r.json());
            const refreshed: UnitCostRecord[] = data.data ?? [];
            setAllRecords(refreshed);
            const updatedRec = refreshed.find((r) => r.name === savedRecord.name);
            if (updatedRec) {
                setEditedFields({
                    display_name: updatedRec.display_name,
                    cost: updatedRec.cost,
                    unit: updatedRec.unit,
                    type: updatedRec.type,
                    ...(updatedRec.type === "machine" ? {
                        throughput: updatedRec.throughput ?? 0,
                        throughput_unit: updatedRec.throughput_unit ?? "linear_foot",
                    } : {}),
                });
            }
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    return (
        <>
            {/* 01 — pick a type, then pick a specific record */}
            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — RECORD SELECTION</div>
                {isLoading ? (
                    <div className="text-xs m-2">Loading records...</div>
                ) : (
                    <div className="flex flex-row gap-4 w-full">
                        <div className="flex flex-col gap-1 flex-1">
                            <div className="text-[10px] ml-1">Type</div>
                            <Dropdown
                                options={uniqueTypes.map(unitTypeLabel)}
                                currOption={unitTypeLabel(selectedType)}
                                onSelect={(label: string) => {
                                    const raw = uniqueTypes.find((t) => unitTypeLabel(t) === label) ?? label;
                                    selectType(raw);
                                }}
                                width="w-full"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-[2]">
                            <div className="text-[10px] ml-1">Record</div>
                            <Dropdown
                                options={recordsForType.map((r) => r.display_name)}
                                currOption={savedRecord?.display_name ?? ""}
                                onSelect={selectRecord}
                                width="w-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 02 — read-only snapshot of the currently saved values */}
            <div className="flex flex-col justify-evenly items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">02 — CURRENT VALUES</div>
                {savedRecord ? (
                    <div className="w-full flex flex-row gap-3">
                        <div className="flex flex-col justify-center items-start p-4 border-2 flex-[2] h-[100px] bg-[#FFF3C2] border-[#FFB604] rounded-md">
                            <div className="text-xs">COST</div>
                            <div className="text-[#FFB604] text-[2.4em] font-instrument">${savedRecord.cost.toFixed(2)}</div>
                        </div>
                        <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                            <div className="text-xs">UNIT</div>
                            <div className="text-[1.2em] font-instrument">{savedRecord.unit}</div>
                        </div>
                        {savedRecord.type === "machine" && (
                            <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                <div className="text-xs">THROUGHPUT</div>
                                <div className="text-[1.2em] font-instrument">
                                    {savedRecord.throughput}
                                    <span className="text-[0.85em] text-[#FFB604] ml-1">
                                        {savedRecord.throughput_unit === "linear_inch" ? "in/hr" : "ft/hr"}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                            <div className="text-xs">LAST UPDATED</div>
                            <div className="text-[1em] font-instrument">{formatDate(savedRecord.last_updated)}</div>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs m-2">Select a record above to view current values.</div>
                )}
            </div>

            {/* 03 — editable inputs; CHANGED badge appears next to any modified field */}
            <div className="flex flex-col items-start w-full flex-1 p-5">
                <div className="text-[10px] m-2">03 — UPDATE VALUES</div>
                {editedFields ? (
                    <div className="flex flex-row gap-4 items-start w-full">
                        <div className="flex-[2] min-w-[200px]">
                            <div className="text-xs font-bold m-2 flex items-center gap-2">
                                Display Name
                                {editedFields.display_name !== savedRecord?.display_name && (
                                    <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>
                                )}
                            </div>
                            <input
                                type="text"
                                value={editedFields.display_name}
                                onChange={(e) => updateField("display_name", e.target.value)}
                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                            />
                        </div>
                        <div className="flex-1 min-w-[110px]">
                            <div className="text-xs font-bold m-2 flex items-center gap-2">
                                Cost ($)
                                {editedFields.cost !== savedRecord?.cost && (
                                    <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>
                                )}
                            </div>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={editedFields.cost}
                                onChange={(e) => updateField("cost", e.target.value)}
                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                            />
                        </div>
                        <div className="flex-1 min-w-[110px]">
                            <div className="text-xs font-bold m-2 flex items-center gap-2">
                                Unit
                                {editedFields.unit !== savedRecord?.unit && (
                                    <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>
                                )}
                            </div>
                            <input
                                type="text"
                                value={editedFields.unit}
                                onChange={(e) => updateField("unit", e.target.value)}
                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                            />
                        </div>
                        {savedRecord?.type === "machine" && (
                            <>
                                <div className="flex-1 min-w-[110px]">
                                    <div className="text-xs font-bold m-2 flex items-center gap-2">
                                        Throughput
                                        {editedFields.throughput !== savedRecord?.throughput && (
                                            <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>
                                        )}
                                    </div>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editedFields.throughput}
                                        onChange={(e) => updateField("throughput", e.target.value)}
                                        className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                    />
                                </div>
                                <div className="w-[155px] shrink-0">
                                    <div className="text-xs font-bold m-2 flex items-center gap-2 whitespace-nowrap">
                                        Throughput Unit
                                        {(editedFields.throughput_unit ?? "linear_foot") !== (savedRecord?.throughput_unit ?? "linear_foot") && (
                                            <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>
                                        )}
                                    </div>
                                    <Dropdown
                                        options={["Linear Foot", "Linear Inch"]}
                                        currOption={editedFields.throughput_unit === "linear_inch" ? "Linear Inch" : "Linear Foot"}
                                        onSelect={(val: string) => updateField("throughput_unit", val === "Linear Inch" ? "linear_inch" : "linear_foot")}
                                        width="w-full"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="text-xs m-2">Select a record above to edit values.</div>
                )}
            </div>

            <ModuleFooter
                isDirty={hasUnsavedChanges}
                isSaving={isSaving}
                secondaryLabel="HISTORY"
                onSecondaryAction={() => setHistoryOpen(true)}
                secondaryDisabled={!savedRecord}
                onSubmit={() => void saveChanges()}
            />

            {savedRecord && (
                <DataCollectorHistoryModal
                    open={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                    title={`Unit Cost History — ${savedRecord.display_name}`}
                    fetchUrl={`/unit-costs/${encodeURIComponent(savedRecord.name)}/history`}
                />
            )}
        </>
    );
}
