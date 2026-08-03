// Shared types, constants, and utilities used across all DataCollector modules.

import { API_BASE } from "@/lib/config";
export { API_BASE };

// ── Display-name maps for raw DB keys ──────────────────────────────────────

export const SUPPLIER_DISPLAY: Record<string, string> = {
    pq: "Pacific Quality",
    fosters: "Foster",
};

export const UNIT_COST_DISPLAY: Record<string, string> = {
    comp: "Comp",
    die: "Die",
    freight: "Freight",
    imposition: "Imposition",
    instruction_sheet: "Instruction Sheet",
    machine: "Machine",
    pallet: "Pallet",
    shipping: "Shipping",
    standee_material: "Standee Material",
};

export const supplierLabel = (raw: string) => SUPPLIER_DISPLAY[raw] ?? raw;
export const unitTypeLabel  = (raw: string) => UNIT_COST_DISPLAY[raw] ?? raw;

export const STANDEE_TYPES = ["Simple Standee", "Moderate Standee", "Complex Standee"];

// ── Shared types (mirror backend database record shapes) ───────────────────

// GET/PATCH /unit-costs
export type UnitCostRecord = {
    _id: string;
    name: string;
    cost: number;
    unit: string;
    last_updated: string;
    type: string;
    display_name: string;
    throughput?: number;
    throughput_unit?: string;
};

export type UnitEditFields = {
    display_name: string;
    cost: number;
    unit: string;
    type: string;
    throughput?: number;
    throughput_unit?: string;
};

// GET /standee-static-costs?standee_type=...
export type StandeeRecord = {
    _id: string;
    standee_type: string;
    [key: string]: number | string;
};

// GET/POST/PATCH/DELETE /overs
export type OversRecord = {
    _id: string;
    lower_bound: number;
    upper_bound: number | null;
    overs: number;
    last_updated: string;
};

// Local edit buffer for an existing overs tier (numbers, not strings)
export type OversEditFields = {
    lower_bound: number;
    upper_bound: number | null;
    overs: number;
};

// A new row being drafted before it's POSTed
export type PendingOversRow = {
    lower_bound: string;
    upper_bound: string;
    overs: string;
};

// GET/POST/PATCH/DELETE /packout
export type PackoutRecord = {
    _id: string;
    standees_lower_bound: number;
    standees_upper_bound: number | null;
    forms_lower_bound: number;
    forms_upper_bound: number | null;
    complexity: string;
    packout: number;
    last_updated: string;
};

export type PackoutEditFields = {
    standees_lower_bound: number;
    standees_upper_bound: number | null;
    forms_lower_bound: number;
    forms_upper_bound: number | null;
    complexity: string;
    packout: number;
};

export type PendingPackoutRow = {
    standees_lower_bound: string;
    standees_upper_bound: string;
    forms_lower_bound: string;
    forms_upper_bound: string;
    complexity: string;
    packout: string;
};

// GET /suppliers/:supplier/materials
export type SupplierMaterial = {
    material: string;
    display_name: string;
};

export type SupplierPriceBreak = {
    amount: number;
    cost: number;
};

// GET/PATCH /suppliers/:supplier/:material
export type SupplierDocument = {
    _id: string;
    supplier: string;
    material: string;
    material_display_name: string;
    material_type: string;
    unit: string;
    price_breaks: SupplierPriceBreak[];
    last_updated: string;
};

// GET .../history — audit trail entry for a Data Collector edit
export type DataCollectorHistoryEntry = {
    _id: string;
    record_key: string;
    record_label: string;
    change_type: "create" | "update" | "delete";
    changed_by: string;
    changes: Record<string, { old: unknown; new: unknown }>;
    created_at: string;
};

// ── Shared utility functions ───────────────────────────────────────────────

export function formatDate(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

export function formatDateTime(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
}

// Converts a snake_case DB key to a human-readable label (e.g. "print_cost" → "Print Cost")
export function formatFieldLabel(key: string): string {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Returns only the editable numeric fields from a standee record (excludes _id and standee_type)
export function standeeNumericFields(record: StandeeRecord): [string, number][] {
    return Object.entries(record).filter(
        ([k, v]) => k !== "_id" && k !== "standee_type" && typeof v === "number",
    ) as [string, number][];
}
