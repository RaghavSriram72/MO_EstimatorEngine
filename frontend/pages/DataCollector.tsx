"use client";
import Dropdown from "@/components/Dropdown";
import EditableValueBox from "@/components/EditableValueBox";
import { useState, useEffect } from "react";

const SUPPLIER_DISPLAY: Record<string, string> = {
    pq: "Pacific Quality",
    fosters: "Foster",
};
const supplierLabel = (raw: string) => SUPPLIER_DISPLAY[raw] ?? raw;

// ── Types ──────────────────────────────────────────────────────────────────
type UnitCostRecord = {
    _id: string;
    name: string;
    cost: number;
    unit: string;
    last_updated: string;
    type: string;
    display_name: string;
};

type UnitEditFields = {
    display_name: string;
    cost: number;
    unit: string;
    type: string;
};

type StandeeRecord = {
    _id: string;
    standee_type: string;
    [key: string]: number | string;
};

type OversRecord = {
    _id: string;
    lower_bound: number;
    upper_bound: number | null;
    overs: number;
    last_updated: string;
};

type SupplierMaterial = {
    material: string;
    display_name: string;
};

type SupplierRecord = {
    _id: string;
    amount: number;
    cost: number;
    unit: string;
    supplier: string;
    material: string;
    material_display_name: string;
    last_updated: string;
};

type SupplierEditFields = { amount: number; cost: number; unit: string };

type ModuleId = 0 | 1 | 2 | 3;

const STANDEE_TYPES = ["Simple Standee", "Moderate Standee", "Complex Standee"];

function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFieldLabel(key: string) {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function standeeNumericFields(record: StandeeRecord): [string, number][] {
    return Object.entries(record).filter(
        ([k, v]) => k !== "_id" && k !== "standee_type" && typeof v === "number"
    ) as [string, number][];
}

// ── Component ──────────────────────────────────────────────────────────────
export default function DataCollector() {
    const [currentModule, setCurrentModule] = useState<ModuleId>(0);
    const [isSaving, setIsSaving] = useState(false);

    // ── Module 0: Unit Costs ───────────────────────────────────────────────
    const [unitRecords, setUnitRecords]     = useState<UnitCostRecord[]>([]);
    const [selectedUnitType, setSelectedUnitType] = useState<string>("");
    const [selectedName, setSelectedName]   = useState<string>("");
    const [unitEdits, setUnitEdits]         = useState<UnitEditFields | null>(null);
    const [isLoadingUnit, setIsLoadingUnit] = useState(false);

    useEffect(() => {
        if (currentModule !== 0) return;
        setIsLoadingUnit(true);
        setSelectedName("");
        setUnitEdits(null);
        fetch("http://localhost:8000/unit-costs")
            .then((r) => r.json())
            .then((data) => setUnitRecords(data.data ?? []))
            .catch(console.error)
            .finally(() => setIsLoadingUnit(false));
    }, [currentModule]);

    const unitTypes = [...new Set(unitRecords.map((r) => r.type))].sort();
    const unitRecordsForType = selectedUnitType ? unitRecords.filter((r) => r.type === selectedUnitType) : [];
    const selectedUnitRecord = unitRecords.find((r) => r.name === selectedName) ?? null;

    function handleUnitTypeSelect(type: string) {
        setSelectedUnitType(type);
        setSelectedName("");
        setUnitEdits(null);
    }

    function handleUnitSelect(displayName: string) {
        const rec = unitRecordsForType.find((r) => r.display_name === displayName);
        if (!rec) return;
        setSelectedName(rec.name);
        setUnitEdits({ display_name: rec.display_name, cost: rec.cost, unit: rec.unit, type: rec.type });
    }

    function handleUnitEdit(field: keyof UnitEditFields, value: string) {
        setUnitEdits((prev) =>
            prev ? { ...prev, [field]: field === "cost" ? parseFloat(value) || 0 : value } : null
        );
    }

    const isUnitDirty =
        !!selectedUnitRecord && !!unitEdits &&
        (unitEdits.cost !== selectedUnitRecord.cost ||
            unitEdits.unit !== selectedUnitRecord.unit ||
            unitEdits.type !== selectedUnitRecord.type ||
            unitEdits.display_name !== selectedUnitRecord.display_name);

    async function handleUnitSubmit() {
        if (!selectedUnitRecord || !unitEdits || !isUnitDirty) return;
        const updates: Partial<UnitEditFields> = {};
        if (unitEdits.cost !== selectedUnitRecord.cost) updates.cost = unitEdits.cost;
        if (unitEdits.unit !== selectedUnitRecord.unit) updates.unit = unitEdits.unit;
        if (unitEdits.type !== selectedUnitRecord.type) updates.type = unitEdits.type;
        if (unitEdits.display_name !== selectedUnitRecord.display_name) updates.display_name = unitEdits.display_name;
        setIsSaving(true);
        try {
            await fetch(`http://localhost:8000/unit-costs/${selectedUnitRecord.name}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const data = await fetch("http://localhost:8000/unit-costs").then((r) => r.json());
            const updated: UnitCostRecord[] = data.data ?? [];
            setUnitRecords(updated);
            const newRec = updated.find((r) => r.name === selectedUnitRecord.name);
            if (newRec) setUnitEdits({ display_name: newRec.display_name, cost: newRec.cost, unit: newRec.unit, type: newRec.type });
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    // ── Module 1: Standee Static Costs ────────────────────────────────────
    const [standeeType, setStandeeType]         = useState<string>("");
    const [standeeRecord, setStandeeRecord]     = useState<StandeeRecord | null>(null);
    const [standeeEdits, setStandeeEdits]       = useState<Record<string, number> | null>(null);
    const [isLoadingStandee, setIsLoadingStandee] = useState(false);

    useEffect(() => {
        if (!standeeType || currentModule !== 1) return;
        setIsLoadingStandee(true);
        setStandeeRecord(null);
        setStandeeEdits(null);
        fetch(`http://localhost:8000/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`)
            .then((r) => r.json())
            .then((data) => {
                const rec: StandeeRecord = data.data;
                setStandeeRecord(rec);
                const edits: Record<string, number> = {};
                standeeNumericFields(rec).forEach(([k, v]) => { edits[k] = v; });
                setStandeeEdits(edits);
            })
            .catch(console.error)
            .finally(() => setIsLoadingStandee(false));
    }, [standeeType, currentModule]);

    function handleStandeeEdit(field: string, value: string) {
        setStandeeEdits((prev) => prev ? { ...prev, [field]: parseFloat(value) || 0 } : null);
    }

    const isStandeeDirty =
        !!standeeRecord && !!standeeEdits &&
        standeeNumericFields(standeeRecord).some(([k, v]) => standeeEdits[k] !== v);

    async function handleStandeeSubmit() {
        if (!standeeRecord || !standeeEdits || !isStandeeDirty) return;
        const updates: Record<string, number> = {};
        standeeNumericFields(standeeRecord).forEach(([k, v]) => {
            if (standeeEdits[k] !== v) updates[k] = standeeEdits[k];
        });
        setIsSaving(true);
        try {
            await fetch(`http://localhost:8000/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates }),
            });
            const data = await fetch(`http://localhost:8000/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`).then((r) => r.json());
            const updated: StandeeRecord = data.data;
            setStandeeRecord(updated);
            const edits: Record<string, number> = {};
            standeeNumericFields(updated).forEach(([k, v]) => { edits[k] = v; });
            setStandeeEdits(edits);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    // ── Module 2: Overs ───────────────────────────────────────────────────
    type OversEditFields = { lower_bound: number; upper_bound: number | null; overs: number };

    const [oversRecords, setOversRecords]     = useState<OversRecord[]>([]);
    const [oversEdits, setOversEdits]         = useState<Record<string, OversEditFields> | null>(null);
    const [isLoadingOvers, setIsLoadingOvers] = useState(false);

    function buildOversEdits(records: OversRecord[]): Record<string, OversEditFields> {
        const edits: Record<string, OversEditFields> = {};
        records.forEach((r) => { edits[r._id] = { lower_bound: r.lower_bound, upper_bound: r.upper_bound, overs: r.overs }; });
        return edits;
    }

    useEffect(() => {
        if (currentModule !== 2) return;
        setIsLoadingOvers(true);
        fetch("http://localhost:8000/overs")
            .then((r) => r.json())
            .then((data) => {
                const records: OversRecord[] = data.data ?? [];
                setOversRecords(records);
                setOversEdits(buildOversEdits(records));
            })
            .catch(console.error)
            .finally(() => setIsLoadingOvers(false));
    }, [currentModule]);

    function handleOversEdit(id: string, field: keyof OversEditFields, value: string) {
        setOversEdits((prev) => {
            if (!prev) return null;
            const current = prev[id];
            if (field === "upper_bound") {
                const parsed = value === "" ? null : parseInt(value);
                return { ...prev, [id]: { ...current, upper_bound: parsed } };
            }
            return { ...prev, [id]: { ...current, [field]: parseInt(value) || 0 } };
        });
    }

    const isOversDirty = !!oversEdits && oversRecords.some((r) => {
        const e = oversEdits[r._id];
        return e && (e.lower_bound !== r.lower_bound || e.upper_bound !== r.upper_bound || e.overs !== r.overs);
    });

    async function handleOversSubmit() {
        if (!isOversDirty || !oversEdits) return;
        setIsSaving(true);
        try {
            await Promise.all(
                oversRecords
                    .filter((r) => {
                        const e = oversEdits[r._id];
                        return e && (e.lower_bound !== r.lower_bound || e.upper_bound !== r.upper_bound || e.overs !== r.overs);
                    })
                    .map((r) =>
                        fetch(`http://localhost:8000/overs/${r._id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(oversEdits[r._id]),
                        })
                    )
            );
            const data = await fetch("http://localhost:8000/overs").then((r) => r.json());
            const updated: OversRecord[] = data.data ?? [];
            setOversRecords(updated);
            setOversEdits(buildOversEdits(updated));
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    // ── Module 3: Suppliers ───────────────────────────────────────────────
    const [supplierNames, setSupplierNames]         = useState<string[]>([]);
    const [selectedSupplier, setSelectedSupplier]   = useState<string>("");
    const [supplierMaterials, setSupplierMaterials] = useState<SupplierMaterial[]>([]);
    const [selectedMaterial, setSelectedMaterial]   = useState<string>("");
    const [supplierRecords, setSupplierRecords]     = useState<SupplierRecord[]>([]);
    const [supplierEdits, setSupplierEdits]         = useState<Record<string, SupplierEditFields> | null>(null);
    const [isLoadingSupplier, setIsLoadingSupplier] = useState(false);

    function buildSupplierEdits(records: SupplierRecord[]): Record<string, SupplierEditFields> {
        const edits: Record<string, SupplierEditFields> = {};
        records.forEach((r) => { edits[r._id] = { amount: r.amount, cost: r.cost, unit: r.unit }; });
        return edits;
    }

    useEffect(() => {
        if (currentModule !== 3) return;
        fetch("http://localhost:8000/suppliers")
            .then((r) => r.json())
            .then((data) => setSupplierNames(data.data ?? []))
            .catch(console.error);
    }, [currentModule]);

    useEffect(() => {
        if (!selectedSupplier || currentModule !== 3) return;
        setSelectedMaterial("");
        setSupplierRecords([]);
        setSupplierEdits(null);
        fetch(`http://localhost:8000/suppliers/${encodeURIComponent(selectedSupplier)}/materials`)
            .then((r) => r.json())
            .then((data) => setSupplierMaterials(data.data ?? []))
            .catch(console.error);
    }, [selectedSupplier, currentModule]);

    useEffect(() => {
        if (!selectedSupplier || !selectedMaterial || currentModule !== 3) return;
        setIsLoadingSupplier(true);
        fetch(`http://localhost:8000/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}`)
            .then((r) => r.json())
            .then((data) => {
                const records: SupplierRecord[] = data.data ?? [];
                setSupplierRecords(records);
                setSupplierEdits(buildSupplierEdits(records));
            })
            .catch(console.error)
            .finally(() => setIsLoadingSupplier(false));
    }, [selectedSupplier, selectedMaterial, currentModule]);

    function handleSupplierEdit(id: string, field: keyof SupplierEditFields, value: string) {
        setSupplierEdits((prev) => {
            if (!prev) return null;
            const parsed = field === "unit" ? value : parseFloat(value) || 0;
            return { ...prev, [id]: { ...prev[id], [field]: parsed } };
        });
    }

    const isSupplierDirty = !!supplierEdits && supplierRecords.some((r) => {
        const e = supplierEdits[r._id];
        return e && (e.amount !== r.amount || e.cost !== r.cost || e.unit !== r.unit);
    });

    async function handleSupplierSubmit() {
        if (!isSupplierDirty || !supplierEdits) return;
        setIsSaving(true);
        try {
            await Promise.all(
                supplierRecords
                    .filter((r) => {
                        const e = supplierEdits[r._id];
                        return e && (e.amount !== r.amount || e.cost !== r.cost || e.unit !== r.unit);
                    })
                    .map((r) =>
                        fetch(`http://localhost:8000/suppliers/${r._id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(supplierEdits[r._id]),
                        })
                    )
            );
            const data = await fetch(`http://localhost:8000/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}`).then((r) => r.json());
            const updated: SupplierRecord[] = data.data ?? [];
            setSupplierRecords(updated);
            setSupplierEdits(buildSupplierEdits(updated));
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    // ── Shared footer actions ──────────────────────────────────────────────
    const activeIsDirty =
        currentModule === 0 ? isUnitDirty :
        currentModule === 1 ? isStandeeDirty :
        currentModule === 2 ? isOversDirty :
        isSupplierDirty;

    const activeHandleSubmit =
        currentModule === 0 ? handleUnitSubmit :
        currentModule === 1 ? handleStandeeSubmit :
        currentModule === 2 ? handleOversSubmit :
        handleSupplierSubmit;

    function handleClear() {
        if (currentModule === 0) { setSelectedUnitType(""); setSelectedName(""); setUnitEdits(null); }
        if (currentModule === 1) { setStandeeType(""); setStandeeRecord(null); setStandeeEdits(null); }
        if (currentModule === 2) { setOversEdits(buildOversEdits(oversRecords)); }
        if (currentModule === 3) {
            setSelectedSupplier("");
            setSelectedMaterial("");
            setSupplierRecords([]);
            setSupplierEdits(null);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">

            {/* Sidebar */}
            <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                <div className="text-[1.2em] font-bold">DB Modules</div>
                <ul className="flex flex-col gap-4 w-full">
                    {([0, 1, 2, 3] as ModuleId[]).map((id) => (
                        <li
                            key={id}
                            className={`${currentModule === id ? "tab-active" : "tab-inactive"} flex items-center gap-5 w-full cursor-pointer`}
                            onClick={() => setCurrentModule(id)}
                        >
                            <span>•</span> {["Unit Costs", "Standee Static Costs", "Overs", "Suppliers"][id]}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Main */}
            <div className="flex flex-col ml-5 p-1 justify-start">
                {/* Animated title */}
                <div className="relative ml-15 pb-3 h-[90px] overflow-hidden">
                    {(["Unit", "Standee Static", "Overs", "Supplier"] as const).map((label, idx) => (
                        <div key={idx} className={`absolute inset-0 ${currentModule === idx ? "data-collector-title-active" : "data-collector-title-inactive"}`}>
                            <div className="text-[3em] font-instrument">Update <span className="italic text-[#FFB604]">{label}</span> Costs</div>
                            <p className="text-xs">Modify Live Data for {label} Cost Records</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col w-[50vw] h-[74vh] border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB]">

                    {/* ── MODULE 0: Unit Costs ── */}
                    {currentModule === 0 && (<>
                        {/* Section 01 */}
                        <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">01 — RECORD SELECTION</div>
                            {isLoadingUnit ? (
                                <div className="text-xs m-2">Loading records...</div>
                            ) : (
                                <div className="flex flex-row gap-4 w-full">
                                    <div className="flex flex-col gap-1 flex-1">
                                        <div className="text-[10px] ml-1">Type</div>
                                        <Dropdown options={unitTypes} currOption={selectedUnitType} onSelect={handleUnitTypeSelect} width="w-full" />
                                    </div>
                                    <div className="flex flex-col gap-1 flex-[2]">
                                        <div className="text-[10px] ml-1">Record</div>
                                        <Dropdown
                                            options={unitRecordsForType.map((r) => r.display_name)}
                                            currOption={selectedUnitRecord?.display_name ?? ""}
                                            onSelect={handleUnitSelect}
                                            width="w-full"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 02 */}
                        <div className="flex flex-col justify-evenly items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">02 — CURRENT VALUES</div>
                            {selectedUnitRecord ? (
                                <div className="w-full flex flex-row gap-3">
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-[2] h-[100px] bg-[#FFF3C2] border-[#FFB604] rounded-md">
                                        <div className="text-xs">COST</div>
                                        <div className="text-[#FFB604] text-[2.4em] font-instrument">${selectedUnitRecord.cost.toFixed(2)}</div>
                                    </div>
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                        <div className="text-xs">UNIT</div>
                                        <div className="text-[1.2em] font-instrument">{selectedUnitRecord.unit}</div>
                                    </div>
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                        <div className="text-xs">TYPE</div>
                                        <div className="text-[1.2em] font-instrument">{selectedUnitRecord.type}</div>
                                    </div>
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                        <div className="text-xs">LAST UPDATED</div>
                                        <div className="text-[1em] font-instrument">{formatDate(selectedUnitRecord.last_updated)}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a record above to view current values.</div>
                            )}
                        </div>

                        {/* Section 03 */}
                        <div className="flex flex-col items-start w-full flex-1 p-5">
                            <div className="text-[10px] m-2">03 — UPDATE VALUES</div>
                            {unitEdits ? (
                                <div className="flex flex-row gap-4 items-start w-full flex-wrap">
                                    <div className="flex-[2] min-w-[200px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Display Name
                                            {unitEdits.display_name !== selectedUnitRecord?.display_name && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="text" value={unitEdits.display_name} onChange={(e) => handleUnitEdit("display_name", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Cost ($)
                                            {unitEdits.cost !== selectedUnitRecord?.cost && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="number" min={0} step={1} value={unitEdits.cost} onChange={(e) => handleUnitEdit("cost", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Unit
                                            {unitEdits.unit !== selectedUnitRecord?.unit && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="text" value={unitEdits.unit} onChange={(e) => handleUnitEdit("unit", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Type
                                            {unitEdits.type !== selectedUnitRecord?.type && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="text" value={unitEdits.type} onChange={(e) => handleUnitEdit("type", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a record above to edit values.</div>
                            )}
                        </div>
                    </>)}

                    {/* ── MODULE 1: Standee Static Costs ── */}
                    {currentModule === 1 && (<>
                        {/* Section 01 */}
                        <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">01 — STANDEE TYPE SELECTION</div>
                            <Dropdown options={STANDEE_TYPES} currOption={standeeType} onSelect={setStandeeType} width="w-[420px]" />
                        </div>

                        {/* Section 02 — editable value boxes */}
                        <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                            <div className="flex items-center gap-2 m-2">
                                <span className="text-[10px]">02 — VALUES</span>
                                {standeeEdits && (
                                    <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                                        Click Any Value to Edit
                                    </span>
                                )}
                            </div>
                            {isLoadingStandee ? (
                                <div className="text-xs m-2">Loading...</div>
                            ) : standeeEdits && standeeRecord ? (
                                <div className="w-full grid grid-cols-3 gap-2">
                                    {standeeNumericFields(standeeRecord).map(([key, origVal]) => (
                                        <EditableValueBox
                                            key={key}
                                            label={formatFieldLabel(key)}
                                            value={standeeEdits[key]}
                                            originalValue={origVal}
                                            onChange={(val) => handleStandeeEdit(key, val)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a standee type above to edit values.</div>
                            )}
                        </div>
                    </>)}

                    {/* ── MODULE 2: Overs ── */}
                    {currentModule === 2 && (<>
                        {/* Section 01 */}
                        <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">01 — QUANTITY TIERS</div>
                            {isLoadingOvers ? (
                                <div className="text-xs m-2">Loading records...</div>
                            ) : (
                                <div className="text-xs m-2 text-[#ABABAB]">
                                    {oversRecords.length} tiers loaded. Edit bounds and overs for any tier below. Leave Upper Bound blank for an open-ended tier.
                                </div>
                            )}
                        </div>

                        {/* Section 02 */}
                        <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                            <div className="flex items-center gap-2 m-2">
                                <span className="text-[10px]">02 — TIER VALUES</span>
                                {isOversDirty && (
                                    <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                                        Unsaved Changes
                                    </span>
                                )}
                            </div>
                            {isLoadingOvers ? (
                                <div className="text-xs m-2">Loading...</div>
                            ) : oversRecords.length > 0 && oversEdits ? (
                                <div className="w-full flex flex-col gap-4">
                                    {oversRecords.map((rec) => {
                                        const e = oversEdits[rec._id];
                                        if (!e) return null;
                                        const lbChanged = e.lower_bound !== rec.lower_bound;
                                        const ubChanged = e.upper_bound !== rec.upper_bound;
                                        const ovChanged = e.overs !== rec.overs;
                                        return (
                                            <div key={rec._id} className="flex flex-row items-end gap-3">
                                                <div className="flex flex-col flex-1">
                                                    <div className="text-xs font-bold m-1 flex items-center gap-2">
                                                        Lower Bound
                                                        {lbChanged && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        value={e.lower_bound}
                                                        onChange={(ev) => handleOversEdit(rec._id, "lower_bound", ev.target.value)}
                                                        className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                                    />
                                                </div>
                                                <div className="flex flex-col flex-1">
                                                    <div className="text-xs font-bold m-1 flex items-center gap-2">
                                                        Upper Bound
                                                        {ubChanged && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        placeholder="∞ (open-ended)"
                                                        value={e.upper_bound ?? ""}
                                                        onChange={(ev) => handleOversEdit(rec._id, "upper_bound", ev.target.value)}
                                                        className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                                    />
                                                </div>
                                                <div className="flex flex-col flex-1">
                                                    <div className="text-xs font-bold m-1 flex items-center gap-2">
                                                        Overs
                                                        {ovChanged && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        value={e.overs}
                                                        onChange={(ev) => handleOversEdit(rec._id, "overs", ev.target.value)}
                                                        className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                                    />
                                                </div>
                                                <div className="flex flex-col justify-center items-start p-2 border-2 w-[130px] shrink-0 border-[#EDEAEA] rounded-md h-[46px]">
                                                    <div className="text-[9px]">LAST UPDATED</div>
                                                    <div className="text-[0.8em] font-instrument text-black">{formatDate(rec.last_updated)}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-xs m-2">No overs records found.</div>
                            )}
                        </div>
                    </>)}

                    {/* ── MODULE 3: Suppliers ── */}
                    {currentModule === 3 && (<>
                        {/* Section 01 — supplier + material selection */}
                        <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">01 — SUPPLIER & MATERIAL</div>
                            <div className="flex flex-row gap-4 w-full">
                                <div className="flex flex-col gap-1 flex-1">
                                    <div className="text-[10px] ml-1">Supplier</div>
                                    <Dropdown
                                        options={supplierNames.map(supplierLabel)}
                                        currOption={supplierLabel(selectedSupplier)}
                                        onSelect={(displayName: string) => {
                                            const raw = supplierNames.find((s) => supplierLabel(s) === displayName) ?? displayName;
                                            setSelectedSupplier(raw);
                                        }}
                                        width="w-full"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 flex-[2]">
                                    <div className="text-[10px] ml-1">Material</div>
                                    <Dropdown
                                        options={supplierMaterials.map((m) => m.display_name)}
                                        currOption={supplierMaterials.find((m) => m.material === selectedMaterial)?.display_name ?? ""}
                                        onSelect={(displayName: string) => {
                                            const match = supplierMaterials.find((m) => m.display_name === displayName);
                                            if (match) setSelectedMaterial(match.material);
                                        }}
                                        width="w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 02 — cost data points */}
                        <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                            <div className="flex items-center gap-2 m-2">
                                <span className="text-[10px]">02 — COST DATA POINTS</span>
                                {isSupplierDirty && (
                                    <span className="text-[10px] font-bold text-[#FFB604] px-1.5 py-0.5 tracking-wide">
                                        Unsaved Changes
                                    </span>
                                )}
                            </div>
                            {!selectedSupplier || !selectedMaterial ? (
                                <div className="text-xs m-2">Select a supplier and material above to view cost data points.</div>
                            ) : isLoadingSupplier ? (
                                <div className="text-xs m-2">Loading...</div>
                            ) : supplierRecords.length > 0 && supplierEdits ? (
                                <>
                                    <div className="flex flex-row gap-3 w-full mb-1 px-1">
                                        <div className="text-[9px] flex-1 font-bold tracking-wider">AMOUNT</div>
                                        <div className="text-[9px] flex-[2] font-bold tracking-wider">COST</div>
                                        <div className="text-[9px] flex-1 font-bold tracking-wider">UNIT</div>
                                        <div className="text-[9px] w-[120px] shrink-0 font-bold tracking-wider">LAST UPDATED</div>
                                    </div>
                                    <div className="w-full flex flex-col gap-2">
                                        {supplierRecords.map((rec) => {
                                            const e = supplierEdits[rec._id];
                                            if (!e) return null;
                                            const amtChanged  = e.amount !== rec.amount;
                                            const costChanged = e.cost   !== rec.cost;
                                            const unitChanged = e.unit   !== rec.unit;
                                            return (
                                                <div key={rec._id} className="flex flex-row items-center gap-3">
                                                    <div className="flex flex-col flex-1">
                                                        {amtChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                                        <input
                                                            type="number" min={0} step={1}
                                                            value={e.amount}
                                                            onChange={(ev) => handleSupplierEdit(rec._id, "amount", ev.target.value)}
                                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col flex-[2]">
                                                        {costChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                                        <input
                                                            type="number" min={0} step={1}
                                                            value={e.cost}
                                                            onChange={(ev) => handleSupplierEdit(rec._id, "cost", ev.target.value)}
                                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col flex-1">
                                                        {unitChanged && <span className="text-[8px] text-[#FFB604] font-bold mb-0.5">CHANGED</span>}
                                                        <input
                                                            type="text"
                                                            value={e.unit}
                                                            onChange={(ev) => handleSupplierEdit(rec._id, "unit", ev.target.value)}
                                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                                        />
                                                    </div>
                                                    <div className="flex justify-center items-center p-2 border-2 w-[120px] shrink-0 border-[#EDEAEA] rounded-md h-[34px]">
                                                        <div className="text-[0.75em] font-instrument text-black">{formatDate(rec.last_updated)}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div className="text-xs m-2">No records found for this combination.</div>
                            )}
                        </div>
                    </>)}

                    {/* Shared footer buttons */}
                    <div className="flex w-full flex-row items-center px-4 py-3 gap-4 border-t-2 border-[#EDEAEA] shrink-0">
                        <div
                            onClick={handleClear}
                            className="text-xs text-center font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-3 rounded-sm flex-1 cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200 uppercase tracking-widest"
                        >
                            CLEAR
                        </div>
                        <div
                            onClick={activeIsDirty && !isSaving ? activeHandleSubmit : undefined}
                            className={`group flex flex-row justify-center gap-4 text-xs font-black py-3 rounded-sm flex-[2] transition-all duration-200 ease-in-out uppercase tracking-widest ${
                                activeIsDirty && !isSaving
                                    ? "bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white cursor-pointer"
                                    : "bg-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                            }`}
                        >
                            {isSaving ? "SAVING..." : "SUBMIT UPDATE"}
                            {activeIsDirty && !isSaving && (
                                <img src="/submitarrow.svg" alt="" className="transition-all duration-300 ease-in-out group-hover:translate-x-1 group-hover:invert" />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
