"use client";
import Dropdown from "@/components/Dropdown";
import { useState, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type WorkCenterRecord = {
    _id: string;
    activity: string;
    cost: number;
    uom: string;
    speed: string;
    unit: string;
};

type WorkCenterEditFields = {
    cost: number;
    uom: string;
    speed: string;
    unit: string;
};

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

type ModuleId = 0 | 1 | 2;

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

    const selectedUnitRecord = unitRecords.find((r) => r.name === selectedName) ?? null;

    function handleUnitSelect(displayName: string) {
        const rec = unitRecords.find((r) => r.display_name === displayName);
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

    // ── Module 2: Work Center Costs ───────────────────────────────────────
    const [wcRecords, setWcRecords]         = useState<WorkCenterRecord[]>([]);
    const [wcSelected, setWcSelected]       = useState<string>("");
    const [wcEdits, setWcEdits]             = useState<WorkCenterEditFields | null>(null);
    const [isLoadingWc, setIsLoadingWc]     = useState(false);

    useEffect(() => {
        if (currentModule !== 2) return;
        setIsLoadingWc(true);
        setWcSelected("");
        setWcEdits(null);
        fetch("http://localhost:8000/work-center-costs")
            .then((r) => r.json())
            .then((data) => setWcRecords(data.data ?? []))
            .catch(console.error)
            .finally(() => setIsLoadingWc(false));
    }, [currentModule]);

    const selectedWcRecord = wcRecords.find((r) => r.activity === wcSelected) ?? null;

    function handleWcSelect(activity: string) {
        const rec = wcRecords.find((r) => r.activity === activity);
        if (!rec) return;
        setWcSelected(rec.activity);
        setWcEdits({ cost: rec.cost, uom: rec.uom, speed: rec.speed, unit: rec.unit });
    }

    function handleWcEdit(field: keyof WorkCenterEditFields, value: string) {
        setWcEdits((prev) =>
            prev ? { ...prev, [field]: field === "cost" ? parseFloat(value) || 0 : value } : null
        );
    }

    const isWcDirty =
        !!selectedWcRecord && !!wcEdits &&
        (wcEdits.cost !== selectedWcRecord.cost ||
            wcEdits.uom !== selectedWcRecord.uom ||
            wcEdits.speed !== selectedWcRecord.speed ||
            wcEdits.unit !== selectedWcRecord.unit);

    async function handleWcSubmit() {
        if (!selectedWcRecord || !wcEdits || !isWcDirty) return;
        const updates: Partial<WorkCenterEditFields> = {};
        if (wcEdits.cost !== selectedWcRecord.cost) updates.cost = wcEdits.cost;
        if (wcEdits.uom !== selectedWcRecord.uom) updates.uom = wcEdits.uom;
        if (wcEdits.speed !== selectedWcRecord.speed) updates.speed = wcEdits.speed;
        if (wcEdits.unit !== selectedWcRecord.unit) updates.unit = wcEdits.unit;
        setIsSaving(true);
        try {
            await fetch(`http://localhost:8000/work-center-costs/${encodeURIComponent(selectedWcRecord.activity)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const data = await fetch("http://localhost:8000/work-center-costs").then((r) => r.json());
            const updated: WorkCenterRecord[] = data.data ?? [];
            setWcRecords(updated);
            const newRec = updated.find((r) => r.activity === selectedWcRecord.activity);
            if (newRec) setWcEdits({ cost: newRec.cost, uom: newRec.uom, speed: newRec.speed, unit: newRec.unit });
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    // ── Shared footer actions ──────────────────────────────────────────────
    const activeIsDirty =
        currentModule === 0 ? isUnitDirty :
        currentModule === 1 ? isStandeeDirty :
        isWcDirty;

    const activeHandleSubmit =
        currentModule === 0 ? handleUnitSubmit :
        currentModule === 1 ? handleStandeeSubmit :
        handleWcSubmit;

    function handleClear() {
        if (currentModule === 0) { setSelectedName(""); setUnitEdits(null); }
        if (currentModule === 1) { setStandeeType(""); setStandeeRecord(null); setStandeeEdits(null); }
        if (currentModule === 2) { setWcSelected(""); setWcEdits(null); }
    }

    const unitDisplayNames = unitRecords.map((r) => r.display_name);

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">

            {/* Sidebar */}
            <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                <div className="text-[1.2em] font-bold">DB Modules</div>
                <ul className="flex flex-col gap-4 w-full">
                    {([0, 1, 2] as ModuleId[]).map((id) => (
                        <li
                            key={id}
                            className={`${currentModule === id ? "tab-active" : "tab-inactive"} flex items-center gap-5 w-full cursor-pointer`}
                            onClick={() => setCurrentModule(id)}
                        >
                            <span>•</span> {["Unit Costs", "Standee Static Costs", "Work Center Costs"][id]}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Main */}
            <div className="flex flex-col ml-5 p-1 justify-start">
                {/* Animated title */}
                <div className="relative ml-15 pb-3 h-[90px] overflow-hidden">
                    {(["Unit", "Standee Static", "Work Center"] as const).map((label, idx) => (
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
                                <Dropdown options={unitDisplayNames} currOption={selectedUnitRecord?.display_name ?? ""} onSelect={handleUnitSelect} width="w-[420px]" />
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
                                        <input type="number" min={0} step={0.01} value={unitEdits.cost} onChange={(e) => handleUnitEdit("cost", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
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

                        {/* Section 02 */}
                        <div className="flex flex-col items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">02 — CURRENT VALUES</div>
                            {isLoadingStandee ? (
                                <div className="text-xs m-2">Loading...</div>
                            ) : standeeRecord ? (
                                <div className="w-full grid grid-cols-3 gap-2">
                                    {standeeNumericFields(standeeRecord).map(([key, val]) => (
                                        <div key={key} className="flex flex-col justify-center items-start px-3 py-2 border-2 border-[#EDEAEA] rounded-md">
                                            <div className="text-[9px] uppercase tracking-wide">{formatFieldLabel(key)}</div>
                                            <div className="text-[1.1em] font-instrument text-[#FFB604]">{typeof val === "number" ? val.toFixed(2) : val}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a standee type above to view current values.</div>
                            )}
                        </div>

                        {/* Section 03 */}
                        <div className="flex flex-col items-start w-full flex-1 p-5 overflow-y-auto">
                            <div className="text-[10px] m-2">03 — UPDATE VALUES</div>
                            {standeeEdits && standeeRecord ? (
                                <div className="w-full grid grid-cols-3 gap-x-4 gap-y-1">
                                    {standeeNumericFields(standeeRecord).map(([key, origVal]) => (
                                        <div key={key} className="flex-1 min-w-[130px]">
                                            <div className="text-xs font-bold m-2 flex items-center gap-2">
                                                {formatFieldLabel(key)}
                                                {standeeEdits[key] !== origVal && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                            </div>
                                            <input
                                                type="number"
                                                step={0.01}
                                                value={standeeEdits[key]}
                                                onChange={(e) => handleStandeeEdit(key, e.target.value)}
                                                className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a standee type above to edit values.</div>
                            )}
                        </div>
                    </>)}

                    {/* ── MODULE 2: Work Center Costs ── */}
                    {currentModule === 2 && (<>
                        {/* Section 01 */}
                        <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">01 — RECORD SELECTION</div>
                            {isLoadingWc ? (
                                <div className="text-xs m-2">Loading records...</div>
                            ) : (
                                <Dropdown options={wcRecords.map((r) => r.activity)} currOption={wcSelected} onSelect={handleWcSelect} width="w-[420px]" />
                            )}
                        </div>

                        {/* Section 02 */}
                        <div className="flex flex-col justify-evenly items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">02 — CURRENT VALUES</div>
                            {selectedWcRecord ? (
                                <div className="w-full flex flex-row gap-3">
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-[2] h-[100px] bg-[#FFF3C2] border-[#FFB604] rounded-md">
                                        <div className="text-xs">COST</div>
                                        <div className="text-[#FFB604] text-[2.4em] font-instrument">${selectedWcRecord.cost.toFixed(2)}</div>
                                    </div>
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                        <div className="text-xs">UOM</div>
                                        <div className="text-[1.2em] font-instrument">{selectedWcRecord.uom}</div>
                                    </div>
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                        <div className="text-xs">SPEED</div>
                                        <div className="text-[1.2em] font-instrument">{selectedWcRecord.speed}</div>
                                    </div>
                                    <div className="flex flex-col justify-center items-start p-4 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                        <div className="text-xs">UNIT</div>
                                        <div className="text-[1.2em] font-instrument">{selectedWcRecord.unit}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a record above to view current values.</div>
                            )}
                        </div>

                        {/* Section 03 */}
                        <div className="flex flex-col items-start w-full flex-1 p-5">
                            <div className="text-[10px] m-2">03 — UPDATE VALUES</div>
                            {wcEdits ? (
                                <div className="flex flex-row gap-4 items-start w-full flex-wrap">
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Cost ($)
                                            {wcEdits.cost !== selectedWcRecord?.cost && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="number" min={0} step={0.01} value={wcEdits.cost} onChange={(e) => handleWcEdit("cost", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            UOM
                                            {wcEdits.uom !== selectedWcRecord?.uom && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="text" value={wcEdits.uom} onChange={(e) => handleWcEdit("uom", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Speed
                                            {wcEdits.speed !== selectedWcRecord?.speed && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="text" value={wcEdits.speed} onChange={(e) => handleWcEdit("speed", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-[110px]">
                                        <div className="text-xs font-bold m-2 flex items-center gap-2">
                                            Unit
                                            {wcEdits.unit !== selectedWcRecord?.unit && <span className="text-[9px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>}
                                        </div>
                                        <input type="text" value={wcEdits.unit} onChange={(e) => handleWcEdit("unit", e.target.value)} className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604] transition-colors" />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs m-2">Select a record above to edit values.</div>
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
