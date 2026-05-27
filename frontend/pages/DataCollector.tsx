"use client";
import { useState } from "react";
import UnitCostsModule  from "@/components/datacollector/UnitCostsModule";
import StandeeModule    from "@/components/datacollector/StandeeModule";
import OversModule      from "@/components/datacollector/OversModule";
import SuppliersModule  from "@/components/datacollector/SuppliersModule";

// Each module tab maps to a self-contained component that owns its own state and API calls.
type ModuleId = 0 | 1 | 2 | 3;

const MODULE_NAV_LABELS   = ["Unit Costs", "Standee Static Costs", "Overs", "Suppliers"] as const;
const MODULE_TITLE_LABELS = ["Unit", "Standee Static", "Overs", "Supplier"] as const;

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
        fetch(`${API_BASE}/unit-costs`)
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
            await fetch(`${API_BASE}/unit-costs/${selectedUnitRecord.name}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const data = await fetch(`${API_BASE}/unit-costs`).then((r) => r.json());
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
        fetch(`${API_BASE}/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`)
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
            await fetch(`${API_BASE}/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates }),
            });
            const data = await fetch(`${API_BASE}/standee-static-costs?standee_type=${encodeURIComponent(standeeType)}`).then((r) => r.json());
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
    type PendingOversRow = { lower_bound: string; upper_bound: string; overs: string };

    const [oversRecords, setOversRecords]         = useState<OversRecord[]>([]);
    const [oversEdits, setOversEdits]             = useState<Record<string, OversEditFields> | null>(null);
    const [isLoadingOvers, setIsLoadingOvers]     = useState(false);
    const [pendingNewOvers, setPendingNewOvers]   = useState<PendingOversRow[]>([]);
    const [pendingDeleteId, setPendingDeleteId]   = useState<string | null>(null);

    function buildOversEdits(records: OversRecord[]): Record<string, OversEditFields> {
        const edits: Record<string, OversEditFields> = {};
        records.forEach((r) => { edits[r._id] = { lower_bound: r.lower_bound, upper_bound: r.upper_bound, overs: r.overs }; });
        return edits;
    }

    useEffect(() => {
        if (currentModule !== 2) return;
        setIsLoadingOvers(true);
        fetch(`${API_BASE}/overs`)
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

    const isOversDirty =
        (!!oversEdits && oversRecords.some((r) => {
            const e = oversEdits[r._id];
            return e && (e.lower_bound !== r.lower_bound || e.upper_bound !== r.upper_bound || e.overs !== r.overs);
        })) || pendingNewOvers.length > 0;

    async function handleOversSubmit() {
        if (!isOversDirty) return;
        setIsSaving(true);
        try {
            const patches = oversEdits
                ? oversRecords.filter((r) => {
                      const e = oversEdits[r._id];
                      return e && (e.lower_bound !== r.lower_bound || e.upper_bound !== r.upper_bound || e.overs !== r.overs);
                  }).map((r) =>
                      fetch(`${API_BASE}/overs/${r._id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(oversEdits[r._id]),
                      })
                  )
                : [];
            const posts = pendingNewOvers
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
                    })
                );
            await Promise.all([...patches, ...posts]);
            const data = await fetch(`${API_BASE}/overs`).then((r) => r.json());
            const updated: OversRecord[] = data.data ?? [];
            setOversRecords(updated);
            setOversEdits(buildOversEdits(updated));
            setPendingNewOvers([]);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    }

    async function confirmDeleteOversTier() {
        if (!pendingDeleteId) return;
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await fetch(`${API_BASE}/overs/${id}`, { method: "DELETE" });
            const data = await fetch(`${API_BASE}/overs`).then((r) => r.json());
            const updated: OversRecord[] = data.data ?? [];
            setOversRecords(updated);
            setOversEdits(buildOversEdits(updated));
        } catch (e) { console.error(e); }
    }

    function handleAddOversRow() {
        setPendingNewOvers((prev) => [...prev, { lower_bound: "", upper_bound: "", overs: "" }]);
    }

    function handlePendingOversEdit(index: number, field: keyof PendingOversRow, value: string) {
        setPendingNewOvers((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    }

    function handleDeletePendingOvers(index: number) {
        setPendingNewOvers((prev) => prev.filter((_, i) => i !== index));
    }

    // ── Module 3: Suppliers ───────────────────────────────────────────────
    const [supplierNames, setSupplierNames]         = useState<string[]>([]);
    const [selectedSupplier, setSelectedSupplier]   = useState<string>("");
    const [supplierMaterials, setSupplierMaterials] = useState<SupplierMaterial[]>([]);
    const [selectedMaterial, setSelectedMaterial]   = useState<string>("");
    const [supplierDoc, setSupplierDoc]             = useState<SupplierDocument | null>(null);
    const [supplierDraft, setSupplierDraft]         = useState<SupplierDocument | null>(null);
    const [isLoadingSupplier, setIsLoadingSupplier] = useState(false);

    const supplierOptions  = useMemo(() => supplierNames.map(supplierLabel), [supplierNames]);
    const materialOptions  = useMemo(() => supplierMaterials.map((m) => m.display_name), [supplierMaterials]);

    useEffect(() => {
        if (currentModule !== 3) return;
        fetch(`${API_BASE}/suppliers`)
            .then((r) => r.json())
            .then((data) => setSupplierNames(data.data ?? []))
            .catch(console.error);
    }, [currentModule]);

    useEffect(() => {
        if (!selectedSupplier) return;
        setSelectedMaterial("");
        setSupplierMaterials([]);
        setSupplierDoc(null);
        setSupplierDraft(null);
        fetch(`${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/materials`)
            .then((r) => r.json())
            .then((data) => setSupplierMaterials(data.data ?? []))
            .catch(console.error);
    }, [selectedSupplier]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!selectedSupplier || !selectedMaterial) return;
        setIsLoadingSupplier(true);
        fetch(`${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}`)
            .then((r) => r.json())
            .then((data) => {
                const doc: SupplierDocument | null = data.data ?? null;
                setSupplierDoc(doc);
                setSupplierDraft(doc ? JSON.parse(JSON.stringify(doc)) : null);
            })
            .catch(console.error)
            .finally(() => setIsLoadingSupplier(false));
    }, [selectedSupplier, selectedMaterial]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleSupplierEdit(index: number, field: "amount" | "cost" | "unit", value: string) {
        setSupplierDraft((prev) => {
            if (!prev) return prev;
            const draft = JSON.parse(JSON.stringify(prev)) as SupplierDocument;
            if (field === "unit") {
                draft.unit = value;
            } else if (typeof draft.price_breaks?.[index] !== "undefined") {
                const parsed = parseFloat(value) || 0;
                draft.price_breaks[index] = { ...draft.price_breaks[index], [field]: parsed } as SupplierPriceBreak;
            }
            return draft;
        });
    }

    function handleAddPriceBreak() {
        setSupplierDraft((prev) => {
            if (prev) return { ...prev, price_breaks: [...prev.price_breaks, { amount: 0, cost: 0 }] };
            const displayName = supplierMaterials.find((m) => m.material === selectedMaterial)?.display_name ?? selectedMaterial;
            return { _id: "", supplier: selectedSupplier, material: selectedMaterial, material_display_name: displayName, unit: "", price_breaks: [{ amount: 0, cost: 0 }], last_updated: "" };
        });
    }

    function handleDeletePriceBreak(index: number) {
        setSupplierDraft((prev) => {
            if (!prev) return prev;
            const draft = JSON.parse(JSON.stringify(prev)) as SupplierDocument;
            draft.price_breaks.splice(index, 1);
            return draft;
        });
    }

    function confirmDeletePriceBreak() {
        if (pendingDeletePbIdx === null) return;
        const idx = pendingDeletePbIdx;
        setPendingDeletePbIdx(null);
        handleDeletePriceBreak(idx);
    }

    const isSupplierDirty = !!supplierDraft && JSON.stringify(supplierDraft) !== JSON.stringify(supplierDoc);

    async function handleSupplierSubmit() {
        if (!isSupplierDirty || !supplierDraft) return;
        setIsSaving(true);
        try {
            await fetch(`${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_name: supplierDraft.material_display_name,
                    unit: supplierDraft.unit,
                    price_breaks: supplierDraft.price_breaks,
                }),
            });
            const data = await fetch(`${API_BASE}/suppliers/${encodeURIComponent(selectedSupplier)}/${encodeURIComponent(selectedMaterial)}`).then((r) => r.json());
            const updatedDoc: SupplierDocument | null = data.data ?? null;
            setSupplierDoc(updatedDoc);
            setSupplierDraft(updatedDoc ? JSON.parse(JSON.stringify(updatedDoc)) : null);
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
        if (currentModule === 2) { setOversEdits(buildOversEdits(oversRecords)); setPendingNewOvers([]); }
        if (currentModule === 3) {
            setSelectedSupplier("");
            setSelectedMaterial("");
            setSupplierDoc(null);
            setSupplierDraft(null);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">

            {/* ── Left sidebar — module navigation ── */}
            <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                <div className="text-[1.2em] font-bold">DB Modules</div>
                <ul className="flex flex-col gap-4 w-full">
                    {([0, 1, 2, 3] as ModuleId[]).map((id) => (
                        <li
                            key={id}
                            className={`${activeModule === id ? "tab-active" : "tab-inactive"} flex items-center gap-5 w-full cursor-pointer`}
                            onClick={() => setActiveModule(id)}
                        >
                            <span>•</span> {MODULE_NAV_LABELS[id]}
                        </li>
                    ))}
                </ul>
            </div>

            {/* ── Main panel ── */}
            <div className="flex flex-col ml-5 p-1 justify-start">

                {/* Animated title — slides when switching modules */}
                <div className="relative ml-15 pb-3 h-[90px] overflow-hidden">
                    {MODULE_TITLE_LABELS.map((label, idx) => (
                        <div
                            key={idx}
                            className={`absolute inset-0 ${activeModule === idx ? "data-collector-title-active" : "data-collector-title-inactive"}`}
                        >
                            <div className="text-[3em] font-instrument">
                                Update <span className="italic text-[#FFB604]">{label}</span> Costs
                            </div>
                            <p className="text-xs">Modify Live Data for {label} Cost Records</p>
                        </div>
                    ))}
                </div>

                {/* Module panel — each module renders its own sections + footer */}
                <div className="flex flex-col w-[50vw] h-[74vh] border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB]">
                    {activeModule === 0 && <UnitCostsModule />}
                    {activeModule === 1 && <StandeeModule />}
                    {activeModule === 2 && <OversModule />}
                    {activeModule === 3 && <SuppliersModule />}
                </div>
            </div>
        </div>
    );
}
