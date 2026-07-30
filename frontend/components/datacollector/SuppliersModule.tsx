"use client";
import { useState, useEffect, useMemo } from "react";
import Dropdown from "@/components/Dropdown";
import ConfirmAlert from "@/components/ConfirmAlert";
import ModuleFooter from "./ModuleFooter";
import {
    API_BASE, SupplierMaterial, SupplierDocument, SupplierPriceBreak,
    supplierLabel, formatDate,
} from "./shared";

const PQ_TYPES = [
    { value: "print", label: "Print" },
    { value: "blank", label: "Blank" },
];

export default function SuppliersModule() {
    const [supplierNames, setSupplierNames]           = useState<string[]>([]);
    const [selectedSupplier, setSelectedSupplier]     = useState("");
    const [materials, setMaterials]                   = useState<SupplierMaterial[]>([]);
    const [selectedMaterial, setSelectedMaterial]     = useState("");
    const [selectedType, setSelectedType]             = useState("");
    // savedDoc = what is currently in the database; draftDoc = locally edited copy
    const [savedDoc, setSavedDoc]                     = useState<SupplierDocument | null>(null);
    const [draftDoc, setDraftDoc]                     = useState<SupplierDocument | null>(null);
    const [priceBreakToDelete, setPriceBreakToDelete] = useState<number | null>(null);
    const [isLoading, setIsLoading]                   = useState(false);
    const [isSaving, setIsSaving]                     = useState(false);

    const supplierOptions = useMemo(() => supplierNames.map(supplierLabel), [supplierNames]);
    const isPQ = selectedSupplier === "pq";

    // GET /suppliers → load the list of supplier names when module mounts
    useEffect(() => {
        fetch(`${API_BASE}/suppliers`)
            .then((r) => r.json())
            .then((data) => setSupplierNames(data.data ?? []))
            .catch(console.error);
    }, []);

    // GET /suppliers/:supplier/materials → load materials when supplier changes
    useEffect(() => {
        if (!selectedSupplier) return;
        setSelectedMaterial("");
        setSelectedType("");
        setMaterials([]);
        setSavedDoc(null);
        setDraftDoc(null);
        fetch(`${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/materials`)
            .then((r) => r.json())
            .then((data) => {
                const mats: SupplierMaterial[] = data.data ?? [];
                setMaterials(mats);
                if (mats.length > 0) setSelectedMaterial(mats[0].material);
                if (selectedSupplier === "pq") setSelectedType("print");
            })
            .catch(console.error);
    }, [selectedSupplier]); // eslint-disable-line react-hooks/exhaustive-deps

    // GET /suppliers/:supplier/:material → load price breaks when material or type changes
    useEffect(() => {
        if (!selectedSupplier || !selectedMaterial) return;
        if (isPQ && !selectedType) return;
        setIsLoading(true);
        const typeParam = selectedType ? `?material_type=${encodeURIComponent(selectedType)}` : "";
        fetch(`${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}${typeParam}`)
            .then((r) => r.json())
            .then((data) => {
                const doc: SupplierDocument | null = data.data ?? null;
                setSavedDoc(doc);
                setDraftDoc(doc ? JSON.parse(JSON.stringify(doc)) : null);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [selectedSupplier, selectedMaterial, selectedType]); // eslint-disable-line react-hooks/exhaustive-deps

    function editPriceBreak(index: number, field: "amount" | "cost" | "unit", value: string) {
        setDraftDoc((prev) => {
            if (!prev) return prev;
            const draft = JSON.parse(JSON.stringify(prev)) as SupplierDocument;
            if (field === "unit") {
                draft.unit = value;
            } else if (draft.price_breaks?.[index] !== undefined) {
                draft.price_breaks[index] = {
                    ...draft.price_breaks[index],
                    [field]: parseFloat(value) || 0,
                } as SupplierPriceBreak;
            }
            return draft;
        });
    }

    function addPriceBreak() {
        setDraftDoc((prev) => {
            if (prev) return { ...prev, price_breaks: [...prev.price_breaks, { amount: 0, cost: 0 }] };
            const displayName = materials.find((m) => m.material === selectedMaterial)?.display_name ?? selectedMaterial;
            return {
                _id: "", supplier: selectedSupplier, material: selectedMaterial,
                material_display_name: displayName, material_type: selectedType,
                unit: "", price_breaks: [{ amount: 0, cost: 0 }], last_updated: "",
            };
        });
    }

    function removePriceBreak(index: number) {
        setDraftDoc((prev) => {
            if (!prev) return prev;
            const draft = JSON.parse(JSON.stringify(prev)) as SupplierDocument;
            draft.price_breaks.splice(index, 1);
            return draft;
        });
    }

    function confirmRemovePriceBreak() {
        if (priceBreakToDelete === null) return;
        const idx = priceBreakToDelete;
        setPriceBreakToDelete(null);
        removePriceBreak(idx);
    }

    const hasUnsavedChanges = !!draftDoc && JSON.stringify(draftDoc) !== JSON.stringify(savedDoc);

    async function saveChanges() {
        if (!hasUnsavedChanges || !draftDoc) return;
        setIsSaving(true);
        try {
            const typeParam = selectedType ? `?material_type=${encodeURIComponent(selectedType)}` : "";
            const base = `${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}`;
            await fetch(base, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_name: draftDoc.material_display_name,
                    unit: draftDoc.unit,
                    price_breaks: draftDoc.price_breaks,
                    material_type: selectedType,
                }),
            });
            const data = await fetch(`${base}${typeParam}`).then((r) => r.json());
            const updatedDoc: SupplierDocument | null = data.data ?? null;
            setSavedDoc(updatedDoc);
            setDraftDoc(updatedDoc ? JSON.parse(JSON.stringify(updatedDoc)) : null);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    function clearSelections() {
        setSelectedSupplier("");
        setSelectedMaterial("");
        setSelectedType("");
        setSavedDoc(null);
        setDraftDoc(null);
    }

    return (
        <>
            <ConfirmAlert
                visible={priceBreakToDelete !== null}
                message="Remove this price break?"
                onConfirm={confirmRemovePriceBreak}
                onCancel={() => setPriceBreakToDelete(null)}
            />

            {/* 01 — choose supplier, material, and (for PQ) type */}
            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — SUPPLIER & MATERIAL</div>
                <div className="flex flex-row gap-4 w-full">
                    <div className="flex flex-col gap-1 flex-1">
                        <div className="text-[10px] ml-1">Supplier</div>
                        <Dropdown
                            options={supplierOptions}
                            currOption={supplierLabel(selectedSupplier)}
                            onSelect={(displayName: string) => {
                                const raw = supplierNames.find((s) => supplierLabel(s) === displayName) ?? displayName;
                                setSelectedSupplier(raw);
                            }}
                            width="w-full"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <div className="text-[10px] ml-1">Material</div>
                        <div className="flex flex-row flex-wrap gap-2 mt-0.5">
                            {materials.length === 0 ? (
                                <span className="text-[10px] text-[#ABABAB] ml-1">Select a supplier first</span>
                            ) : materials.map((m) => (
                                <button
                                    key={m.material}
                                    type="button"
                                    onClick={() => setSelectedMaterial(m.material)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-colors cursor-pointer ${
                                        selectedMaterial === m.material
                                            ? "bg-[#FFC843] border-[#FFC843] text-[#000005]"
                                            : "border-[#EDEAEA] text-[#ABABAB] hover:border-[#FFC843] hover:text-[#000005]"
                                    }`}
                                >
                                    {m.display_name}
                                </button>
                            ))}
                        </div>
                    </div>
                    {isPQ && (
                        <div className="flex flex-col gap-1 flex-1">
                            <div className="text-[10px] ml-1">Type</div>
                            <div className="flex flex-row gap-2 mt-0.5">
                                {PQ_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setSelectedType(t.value)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-colors cursor-pointer ${
                                            selectedType === t.value
                                                ? "bg-[#FFC843] border-[#FFC843] text-[#000005]"
                                                : "border-[#EDEAEA] text-[#ABABAB] hover:border-[#FFC843] hover:text-[#000005]"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 02 — editable price break rows */}
            <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                <div className="flex items-center gap-2 m-2">
                    <span className="text-[10px]">02 — COST DATA POINTS</span>
                    {hasUnsavedChanges && (
                        <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                            Unsaved Changes
                        </span>
                    )}
                </div>

                {!selectedSupplier || !selectedMaterial || (isPQ && !selectedType) ? (
                    <div className="text-xs m-2">
                        {isPQ && selectedMaterial && !selectedType
                            ? "Select a type above to view cost data points."
                            : "Select a supplier and material above to view cost data points."}
                    </div>
                ) : isLoading ? (
                    <div className="text-xs m-2">Loading...</div>
                ) : draftDoc && draftDoc.price_breaks && draftDoc.price_breaks.length > 0 ? (
                    <>
                        {/* Column headers */}
                        <div className="flex flex-row gap-3 w-full mb-1 px-1">
                            <div className="text-[9px] flex-1 font-bold tracking-wider">AMOUNT</div>
                            <div className="text-[9px] flex-[2] font-bold tracking-wider">COST</div>
                            <div className="text-[9px] flex-1 font-bold tracking-wider">UNIT</div>
                            <div className="text-[9px] w-[120px] shrink-0 font-bold tracking-wider">LAST UPDATED</div>
                        </div>
                        <div className="w-full flex flex-col gap-2">
                            {draftDoc.price_breaks.map((pb, idx) => {
                                const original = savedDoc?.price_breaks?.[idx];
                                const amountChanged = !!original && pb.amount !== original.amount;
                                const costChanged   = !!original && pb.cost !== original.cost;
                                const unitChanged   = !!savedDoc && draftDoc.unit !== savedDoc.unit;
                                const isNew         = !original;
                                return (
                                    <div key={idx} className="flex flex-row items-center gap-3">
                                        <div className="flex flex-col flex-1">
                                            {(amountChanged || isNew) && (
                                                <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">
                                                    {isNew ? "NEW" : "CHANGED"}
                                                </span>
                                            )}
                                            <input
                                                type="number" min={0} step={1}
                                                value={pb.amount}
                                                onChange={(e) => editPriceBreak(idx, "amount", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-[2]">
                                            {(costChanged || isNew) && (
                                                <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">
                                                    {isNew ? "NEW" : "CHANGED"}
                                                </span>
                                            )}
                                            <input
                                                type="number" min={0} step={1}
                                                value={pb.cost}
                                                onChange={(e) => editPriceBreak(idx, "cost", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col flex-1">
                                            {(unitChanged || isNew) && (
                                                <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">
                                                    {isNew ? "NEW" : "CHANGED"}
                                                </span>
                                            )}
                                            <input
                                                type="text"
                                                value={draftDoc.unit}
                                                onChange={(e) => editPriceBreak(idx, "unit", e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                        <div className="flex justify-center items-center p-2 border-2 w-[120px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                            <div className="text-[0.75em] font-instrument text-black">
                                                {isNew ? "—" : formatDate(savedDoc?.last_updated ?? "")}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setPriceBreakToDelete(idx)}
                                            className="shrink-0 h-[34px] px-3 text-xs font-bold border-2 border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-red-300 hover:text-red-400 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            onClick={addPriceBreak}
                            className="mt-2 px-4 h-[34px] text-xs cursor-pointer font-bold border-2 border-dashed border-[#EDEAEA] rounded-md text-[#ABABAB] hover:border-[#FFB604] hover:text-[#FFB604] transition-colors"
                        >
                            + ADD ROW
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col gap-2 m-2">
                        <div className="text-xs text-[#ABABAB]">No records found for this combination.</div>
                        <button
                            onClick={addPriceBreak}
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
                onClear={clearSelections}
                onSubmit={() => void saveChanges()}
            />
        </>
    );
}
