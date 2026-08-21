"use client";

import { useEffect, useState } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";
import DataCollectorHistoryModal from "./DataCollectorHistoryModal";
import ModuleFooter from "./ModuleFooter";
import {
    API_BASE,
    PendingStandeeTemplateTier,
    StandeeTemplate,
    StandeeTemplateEditFields,
    StandeeTemplateTierEditFields,
    formatDate,
} from "./shared";

type TierDeleteTarget = {
    templateId: string;
    tierId: string;
};

function templateFields(template: StandeeTemplate): StandeeTemplateEditFields {
    return {
        name: template.name,
        description: template.description,
        is_active: template.is_active,
        sort_order: template.sort_order,
    };
}

function tierFields(template: StandeeTemplate): Record<string, StandeeTemplateTierEditFields> {
    return Object.fromEntries(
        template.tiers.map((tier) => [
            tier._id,
            { quantity: tier.quantity, unit_price: tier.unit_price },
        ]),
    );
}

function money(value: number): string {
    return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

async function apiRequest(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, init);
    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const body = await response.json();
            message = body.error ?? body.detail ?? body.message ?? message;
        } catch {
            // Keep the status-based fallback for non-JSON responses.
        }
        throw new Error(message);
    }
    return response;
}

function normalizeTemplates(raw: unknown): StandeeTemplate[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>, index) => ({
        _id: String(item._id ?? item.template_id ?? ""),
        key: String(item.key ?? item.template_key ?? ""),
        name: String(item.name ?? "Unnamed template"),
        description: String(item.description ?? ""),
        is_active: Boolean(item.is_active),
        sort_order: Number(item.sort_order ?? index),
        last_updated: String(item.last_updated ?? item.updated_at ?? ""),
        tiers: (Array.isArray(item.tiers) ? item.tiers : Array.isArray(item.prices) ? item.prices : []).map(
            (tier: Record<string, unknown>) => ({
                _id: String(tier._id ?? tier.template_price_id ?? ""),
                quantity: Number(tier.quantity ?? 0),
                unit_price: Number(tier.unit_price ?? tier.unit_sell_price ?? 0),
                last_updated: String(tier.last_updated ?? tier.updated_at ?? ""),
            }),
        ),
    }));
}

export default function TemplatePricingModule() {
    const [templates, setTemplates] = useState<StandeeTemplate[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [edit, setEdit] = useState<StandeeTemplateEditFields | null>(null);
    const [tierEdits, setTierEdits] = useState<Record<string, StandeeTemplateTierEditFields>>({});
    const [pendingTiers, setPendingTiers] = useState<PendingStandeeTemplateTier[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<TierDeleteTarget | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);

    const selected = templates.find((template) => template._id === selectedId) ?? null;
    const metadataDirty = !!selected && !!edit && (
        edit.name !== selected.name ||
        edit.description !== selected.description ||
        edit.is_active !== selected.is_active
    );
    const tiersDirty = !!selected && selected.tiers.some((tier) => {
        const next = tierEdits[tier._id];
        return !!next && (next.quantity !== tier.quantity || next.unit_price !== tier.unit_price);
    });
    const hasUnsavedChanges = metadataDirty || tiersDirty || pendingTiers.length > 0;

    function selectTemplate(template: StandeeTemplate) {
        if (template._id === selectedId) return;
        if (hasUnsavedChanges && !window.confirm("Discard unsaved template pricing changes?")) return;
        setSelectedId(template._id);
        setEdit(templateFields(template));
        setTierEdits(tierFields(template));
        setPendingTiers([]);
        setError(null);
    }

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        apiRequest(`${API_BASE}/standee-templates?include_inactive=true`)
            .then((response) => response.json())
            .then((body) => {
                if (cancelled) return;
                const loaded = normalizeTemplates(body.data);
                setTemplates(loaded);
                if (loaded.length > 0) {
                    setSelectedId(loaded[0]._id);
                    setEdit(templateFields(loaded[0]));
                    setTierEdits(tierFields(loaded[0]));
                }
            })
            .catch((reason: unknown) => {
                if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load templates.");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    async function reloadTemplates(preferredId: string) {
        const response = await apiRequest(`${API_BASE}/standee-templates?include_inactive=true`);
        const body = await response.json();
        const loaded = normalizeTemplates(body.data);
        setTemplates(loaded);
        const next = loaded.find((template) => template._id === preferredId) ?? loaded[0] ?? null;
        setSelectedId(next?._id ?? null);
        setEdit(next ? templateFields(next) : null);
        setTierEdits(next ? tierFields(next) : {});
        setPendingTiers([]);
    }

    function updateTier(
        tierId: string,
        field: keyof StandeeTemplateTierEditFields,
        rawValue: string,
    ) {
        const value = Number(rawValue);
        setTierEdits((current) => ({
            ...current,
            [tierId]: { ...current[tierId], [field]: Number.isFinite(value) ? value : 0 },
        }));
    }

    function updatePendingTier(
        index: number,
        field: keyof PendingStandeeTemplateTier,
        value: string,
    ) {
        setPendingTiers((current) =>
            current.map((tier, tierIndex) => tierIndex === index ? { ...tier, [field]: value } : tier),
        );
    }

    function validationError(): string | null {
        if (!edit?.name.trim()) return "Template name is required.";
        const quantities: number[] = [];
        for (const tier of Object.values(tierEdits)) {
            if (!Number.isInteger(tier.quantity) || tier.quantity <= 0) {
                return "Tier quantities must be positive whole numbers.";
            }
            if (!Number.isFinite(tier.unit_price) || tier.unit_price < 0) {
                return "Unit prices must be zero or greater.";
            }
            quantities.push(tier.quantity);
        }
        for (const tier of pendingTiers) {
            if (tier.quantity.trim() === "" || tier.unit_price.trim() === "") {
                return "Complete or remove each new tier before submitting.";
            }
            const quantity = Number(tier.quantity);
            const unitPrice = Number(tier.unit_price);
            if (!Number.isInteger(quantity) || quantity <= 0) {
                return "Tier quantities must be positive whole numbers.";
            }
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                return "Unit prices must be zero or greater.";
            }
            quantities.push(quantity);
        }
        if (new Set(quantities).size !== quantities.length) {
            return "Each template tier must have a unique quantity.";
        }
        return null;
    }

    async function saveChanges() {
        if (!selected || !edit || !hasUnsavedChanges) return;
        const invalid = validationError();
        if (invalid) {
            setError(invalid);
            return;
        }

        setIsSaving(true);
        setError(null);
        const changedBy = localStorage.getItem("username")?.trim() ?? "";
        const jsonHeaders = { "Content-Type": "application/json" };
        try {
            const requests: Promise<Response>[] = [];
            if (metadataDirty) {
                requests.push(apiRequest(`${API_BASE}/standee-templates/${selected._id}`, {
                    method: "PATCH",
                    headers: jsonHeaders,
                    body: JSON.stringify({
                        template_key: selected.key,
                        name: edit.name.trim(),
                        description: edit.description,
                        is_active: edit.is_active,
                        changed_by: changedBy,
                    }),
                }));
            }
            selected.tiers.forEach((tier) => {
                const next = tierEdits[tier._id];
                if (next && (next.quantity !== tier.quantity || next.unit_price !== tier.unit_price)) {
                    requests.push(apiRequest(
                        `${API_BASE}/standee-templates/${selected._id}/prices/${tier._id}`,
                        {
                            method: "PATCH",
                            headers: jsonHeaders,
                            body: JSON.stringify({
                                quantity: next.quantity,
                                unit_sell_price: next.unit_price,
                                changed_by: changedBy,
                            }),
                        },
                    ));
                }
            });
            pendingTiers.forEach((tier) => {
                requests.push(apiRequest(`${API_BASE}/standee-templates/${selected._id}/prices`, {
                    method: "POST",
                    headers: jsonHeaders,
                    body: JSON.stringify({
                        quantity: Number(tier.quantity),
                        unit_sell_price: Number(tier.unit_price),
                        changed_by: changedBy,
                    }),
                }));
            });
            await Promise.all(requests);
            await reloadTemplates(selected._id);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Could not save template pricing.");
        } finally {
            setIsSaving(false);
        }
    }

    async function deleteTier() {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleteTarget(null);
        setError(null);
        const changedBy = localStorage.getItem("username")?.trim() ?? "";
        try {
            await apiRequest(
                `${API_BASE}/standee-templates/${target.templateId}/prices/${target.tierId}?changed_by=${encodeURIComponent(changedBy)}`,
                { method: "DELETE" },
            );
            await reloadTemplates(target.templateId);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Could not delete the tier.");
        }
    }

    return (
        <>
            <ConfirmAlert
                visible={deleteTarget !== null}
                message="Delete this template pricing tier? This cannot be undone."
                onConfirm={() => void deleteTier()}
                onCancel={() => setDeleteTarget(null)}
            />

            <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                <div className="text-[10px] m-2">01 — STANDEE TEMPLATES</div>
                <div className="flex flex-wrap gap-2 m-2">
                    {isLoading && <span className="text-xs">Loading templates...</span>}
                    {!isLoading && templates.length === 0 && <span className="text-xs">No templates found.</span>}
                    {templates.map((template) => (
                        <button
                            key={template._id}
                            type="button"
                            onClick={() => selectTemplate(template)}
                            className={`px-3 py-2 rounded-md border-2 text-xs font-bold transition-colors ${
                                selectedId === template._id
                                    ? "border-[#FFC843] bg-[#fff7dd] text-black"
                                    : "border-[#EDEAEA] text-[#ABABAB] hover:text-black"
                            }`}
                        >
                            {template.name}
                            {!template.is_active && <span className="ml-1 text-[9px] font-normal">(inactive)</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col w-full flex-1 p-5 overflow-y-auto gap-5">
                {error && (
                    <div role="alert" className="mx-2 px-3 py-2 border border-red-200 bg-red-50 text-red-600 text-xs rounded-md">
                        {error}
                    </div>
                )}
                {selected && edit && (
                    <>
                        <section className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 mx-2">
                                <span className="text-[10px]">02 — TEMPLATE DETAILS</span>
                                {hasUnsavedChanges && (
                                    <span className="text-[10px] font-bold text-[#FFB604]">Unsaved Changes</span>
                                )}
                            </div>
                            <div className="grid grid-cols-[2fr_3fr_1fr] gap-3 mx-2 items-end">
                                <label className="text-[9px] font-bold tracking-wider">
                                    NAME
                                    <input
                                        value={edit.name}
                                        onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                                        className="mt-1 border-2 border-[#EDEAEA] rounded-md w-full p-2 outline-none text-black text-xs focus:border-[#FFB604]"
                                    />
                                </label>
                                <label className="text-[9px] font-bold tracking-wider">
                                    DESCRIPTION
                                    <textarea
                                        rows={2}
                                        value={edit.description}
                                        onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                                        className="mt-1 border-2 border-[#EDEAEA] rounded-md w-full p-2 outline-none text-black text-xs focus:border-[#FFB604] resize-none"
                                    />
                                </label>
                                <label className="flex items-center gap-2 h-[34px] text-[10px] font-bold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={edit.is_active}
                                        onChange={(event) => setEdit({ ...edit, is_active: event.target.checked })}
                                        className="accent-[#FFC843]"
                                    />
                                    AVAILABLE
                                </label>
                            </div>
                            <div className="mx-2 text-[10px] text-[#ABABAB]">
                                Key: {selected.key} · Updated {formatDate(selected.last_updated)}
                            </div>
                        </section>

                        <section className="flex flex-col gap-2">
                            <div className="text-[10px] mx-2">03 — QUANTITY PRICING</div>
                            <div className="grid grid-cols-[1fr_1fr_1fr_110px_34px] gap-3 mx-2 text-[9px] font-bold tracking-wider">
                                <span>QUANTITY</span>
                                <span>UNIT PRICE</span>
                                <span>CALCULATED TOTAL</span>
                                <span>UPDATED</span>
                                <span />
                            </div>
                            {selected.tiers.map((tier) => {
                                const values = tierEdits[tier._id];
                                if (!values) return null;
                                return (
                                    <div key={tier._id} className="grid grid-cols-[1fr_1fr_1fr_110px_34px] gap-3 mx-2 items-center">
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={values.quantity}
                                            onChange={(event) => updateTier(tier._id, "quantity", event.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604]"
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={values.unit_price}
                                            onChange={(event) => updateTier(tier._id, "unit_price", event.target.value)}
                                            className="border-2 border-[#EDEAEA] rounded-md w-full p-1.5 outline-none text-black text-xs focus:border-[#FFB604]"
                                        />
                                        <div className="border-2 border-[#EDEAEA] rounded-md p-1.5 text-black text-xs bg-[#FAFAFA]">
                                            {money(values.quantity * values.unit_price)}
                                        </div>
                                        <div className="text-[10px] text-black">{formatDate(tier.last_updated)}</div>
                                        <button
                                            type="button"
                                            aria-label={`Delete ${values.quantity} quantity tier`}
                                            onClick={() => setDeleteTarget({ templateId: selected._id, tierId: tier._id })}
                                            className="h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md hover:border-red-300 hover:text-red-400"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                            {pendingTiers.map((tier, index) => {
                                const total = Number(tier.quantity) * Number(tier.unit_price);
                                return (
                                    <div key={`new-${index}`} className="grid grid-cols-[1fr_1fr_1fr_110px_34px] gap-3 mx-2 items-center">
                                        <input
                                            aria-label="New tier quantity"
                                            type="number"
                                            min={1}
                                            step={1}
                                            placeholder="Quantity"
                                            value={tier.quantity}
                                            onChange={(event) => updatePendingTier(index, "quantity", event.target.value)}
                                            className="border-2 border-[#FFC843] rounded-md w-full p-1.5 outline-none text-black text-xs"
                                        />
                                        <input
                                            aria-label="New tier unit price"
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            placeholder="Unit price"
                                            value={tier.unit_price}
                                            onChange={(event) => updatePendingTier(index, "unit_price", event.target.value)}
                                            className="border-2 border-[#FFC843] rounded-md w-full p-1.5 outline-none text-black text-xs"
                                        />
                                        <div className="border-2 border-[#EDEAEA] rounded-md p-1.5 text-black text-xs bg-[#FAFAFA]">
                                            {Number.isFinite(total) ? money(total) : "—"}
                                        </div>
                                        <div className="text-[10px] text-[#FFB604] font-bold">NEW</div>
                                        <button
                                            type="button"
                                            aria-label="Remove new tier"
                                            onClick={() => setPendingTiers((current) => current.filter((_, i) => i !== index))}
                                            className="h-[34px] w-[34px] text-xs font-bold border-2 border-[#EDEAEA] rounded-md hover:border-red-300 hover:text-red-400"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                            {selected.tiers.length === 0 && pendingTiers.length === 0 && (
                                <div className="mx-2 text-xs text-[#ABABAB]">
                                    No quantity tiers. This template can remain inactive without pricing.
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setPendingTiers((current) => [...current, { quantity: "", unit_price: "" }])}
                                className="mx-2 self-start px-4 h-[34px] text-xs font-bold border-2 border-dashed border-[#EDEAEA] rounded-md hover:border-[#FFB604] hover:text-[#FFB604]"
                            >
                                + ADD TIER
                            </button>
                        </section>
                    </>
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
                title={selected ? `${selected.name} Template History` : "Template Pricing History"}
                fetchUrl={`/standee-templates/history${selected ? `?template_id=${encodeURIComponent(selected._id)}` : ""}`}
            />
        </>
    );
}
