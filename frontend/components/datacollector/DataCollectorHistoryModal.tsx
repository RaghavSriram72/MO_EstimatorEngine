"use client";
import { useEffect, useRef, useState } from "react";
import { API_BASE, DataCollectorHistoryEntry, formatFieldLabel, formatDateTime } from "./shared";

type ChangeType = DataCollectorHistoryEntry["change_type"];

const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
};

const CHANGE_TYPE_STYLE: Record<ChangeType, string> = {
    create: "bg-[#E8F5E9] text-[#2E7D32]",
    update: "bg-[#E3F2FD] text-[#1565C0]",
    delete: "bg-[#FDECEA] text-[#C62828]",
};

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    fetchUrl: string;
};

type PriceBreak = { amount: number; cost: number };

function isPriceBreakArray(v: unknown): v is PriceBreak[] {
    return (
        Array.isArray(v) &&
        v.every((row) => typeof row === "object" && row !== null && "amount" in row && "cost" in row)
    );
}

function formatNumber(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatValue(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (Array.isArray(v)) return v.length === 0 ? "(none)" : v.map((x) => String(x)).join(", ");
    if (typeof v === "number") return formatNumber(v);
    return String(v);
}

type PriceBreakRow =
    | { kind: "added"; amount: number; cost: number }
    | { kind: "removed"; amount: number; cost: number }
    | { kind: "changed"; oldAmount: number; newAmount: number; oldCost: number; newCost: number };

// Diffs two price-break arrays positionally (tier 1 vs tier 1, tier 2 vs tier 2, ...) rather
// than by amount — the backend always stores them sorted by amount, so this is what lets an
// edited threshold (e.g. 251 -> 250) read as "251 -> 250 units: $20,384" instead of a spurious
// remove-251 + add-250 pair with no visible link between them.
function diffPriceBreaks(oldArr: PriceBreak[], newArr: PriceBreak[]): PriceBreakRow[] {
    const rows: PriceBreakRow[] = [];
    const minLen = Math.min(oldArr.length, newArr.length);
    for (let i = 0; i < minLen; i++) {
        const o = oldArr[i];
        const n = newArr[i];
        if (o.amount !== n.amount || o.cost !== n.cost) {
            rows.push({ kind: "changed", oldAmount: o.amount, newAmount: n.amount, oldCost: o.cost, newCost: n.cost });
        }
    }
    for (let i = minLen; i < newArr.length; i++) rows.push({ kind: "added", amount: newArr[i].amount, cost: newArr[i].cost });
    for (let i = minLen; i < oldArr.length; i++) rows.push({ kind: "removed", amount: oldArr[i].amount, cost: oldArr[i].cost });
    return rows;
}

export default function DataCollectorHistoryModal({ open, onClose, title, fetchUrl }: Props) {
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);
    const [entries, setEntries] = useState<DataCollectorHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchSeq = useRef(0);

    useEffect(() => {
        if (open) {
            setMounted(true);
            const id = setTimeout(() => setVisible(true), 10);
            return () => clearTimeout(id);
        } else {
            setVisible(false);
            const id = setTimeout(() => setMounted(false), 320);
            return () => clearTimeout(id);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        const seq = ++fetchSeq.current;
        setLoading(true);
        setError(null);
        fetch(`${API_BASE}${fetchUrl}`)
            .then((r) => r.json())
            .then((data) => {
                if (seq !== fetchSeq.current) return;
                setEntries(Array.isArray(data.data) ? data.data : []);
            })
            .catch(() => {
                if (seq !== fetchSeq.current) return;
                setError("Could not load history");
                setEntries([]);
            })
            .finally(() => {
                if (seq === fetchSeq.current) setLoading(false);
            });
    }, [open, fetchUrl]);

    if (!mounted) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-[background-color] duration-300 ${
                visible ? "bg-[#000005]/40" : "bg-[#000005]/0"
            }`}
            role="presentation"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="dc-history-modal-title"
                className={`w-full max-w-2xl h-[75vh] border-2 border-[#000005] bg-white rounded-sm p-7 flex flex-col gap-4 ${
                    visible ? "modal-slide-up" : "modal-slide-down"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-black text-[#FFC843] tracking-widest uppercase mb-1">
                            // HISTORY
                        </div>
                        <h2 id="dc-history-modal-title" className="text-xl font-black text-[#000005] uppercase tracking-tight">
                            {title}
                        </h2>
                        <p className="text-[11px] text-[#B1B3B6] font-semibold mt-1">
                            Every edit made through the Data Collector is recorded here.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close history"
                        className="shrink-0 text-[#B1B3B6] hover:text-[#000005] text-lg font-black leading-none px-1"
                    >
                        ×
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 -mx-1 px-1">
                    {loading && <div className="text-[11px] text-[#B1B3B6] font-semibold px-1 py-4">Loading…</div>}
                    {error && <div className="text-[11px] text-red-500 font-semibold px-1 py-2">{error}</div>}
                    {!loading && !error && entries.length === 0 && (
                        <div className="text-[11px] text-[#B1B3B6] font-semibold px-1 py-4">
                            No history yet — edits start recording from now.
                        </div>
                    )}
                    {entries.map((entry) => {
                        const fields = Object.entries(entry.changes);
                        return (
                            <div key={entry._id} className="rounded-sm border-2 border-[#E0E0E0] bg-white px-3 py-2.5 flex flex-col gap-2">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${CHANGE_TYPE_STYLE[entry.change_type]}`}>
                                        {CHANGE_TYPE_LABEL[entry.change_type]}
                                    </span>
                                    <span className="min-w-0 flex-1 text-[12px] font-bold text-[#000005] truncate">
                                        {entry.record_label}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-[#B1B3B6] font-semibold">
                                        {entry.changed_by}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-[#B1B3B6] font-semibold whitespace-nowrap text-right">
                                        {formatDateTime(entry.created_at)}
                                    </span>
                                </div>
                                {fields.length > 0 && (
                                    <div className="flex flex-col">
                                        {fields.map(([field, { old, new: newVal }]) => {
                                            const isPriceBreaks =
                                                isPriceBreakArray(old ?? []) && isPriceBreakArray(newVal ?? []);
                                            if (isPriceBreaks) {
                                                const rows = diffPriceBreaks(
                                                    (old as PriceBreak[] | null) ?? [],
                                                    (newVal as PriceBreak[] | null) ?? [],
                                                );
                                                return (
                                                    <div key={field} className="flex flex-col gap-1 text-[11px] border-t border-[#F4F4F4] py-1 first:border-t-0 first:pt-0">
                                                        <span className="text-[#B1B3B6] font-bold">{formatFieldLabel(field)}</span>
                                                        <div className="flex flex-col gap-0.5">
                                                            {rows.map((row, i) => (
                                                                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                                                                    {row.kind === "added" && (
                                                                        <>
                                                                            <span className="text-[#000005] font-semibold shrink-0">{formatNumber(row.amount)} units:</span>
                                                                            <span className="text-[#2E7D32] font-bold">+ ${formatNumber(row.cost)}</span>
                                                                        </>
                                                                    )}
                                                                    {row.kind === "removed" && (
                                                                        <span className="text-red-500 line-through font-semibold">
                                                                            {formatNumber(row.amount)} units: ${formatNumber(row.cost)}
                                                                        </span>
                                                                    )}
                                                                    {row.kind === "changed" && (
                                                                        <>
                                                                            <span className="text-[#000005] font-semibold shrink-0">
                                                                                {row.oldAmount === row.newAmount ? (
                                                                                    `${formatNumber(row.oldAmount)} units:`
                                                                                ) : (
                                                                                    <>
                                                                                        <span className="text-red-500 line-through">{formatNumber(row.oldAmount)}</span>
                                                                                        {" → "}
                                                                                        <span className="text-[#2E7D32]">{formatNumber(row.newAmount)}</span>
                                                                                        {" units:"}
                                                                                    </>
                                                                                )}
                                                                            </span>
                                                                            {row.oldCost === row.newCost ? (
                                                                                <span className="text-[#000005] font-semibold">${formatNumber(row.newCost)}</span>
                                                                            ) : (
                                                                                <>
                                                                                    <span className="text-red-500 line-through font-semibold">${formatNumber(row.oldCost)}</span>
                                                                                    <span className="text-[#B1B3B6]">→</span>
                                                                                    <span className="text-[#2E7D32] font-bold">${formatNumber(row.newCost)}</span>
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div key={field} className="flex items-start justify-between gap-3 text-[11px] border-t border-[#F4F4F4] py-1 first:border-t-0 first:pt-0">
                                                    <span className="text-[#B1B3B6] font-bold shrink-0 w-2/5 pt-0.5">
                                                        {formatFieldLabel(field)}
                                                    </span>
                                                    <span className="flex-1 flex items-start gap-1.5 justify-end min-w-0 flex-wrap">
                                                        <span className="text-red-500 line-through font-semibold text-right break-words">
                                                            {formatValue(old)}
                                                        </span>
                                                        <span className="text-[#B1B3B6] shrink-0">→</span>
                                                        <span className="text-[#2E7D32] font-bold text-right break-words">
                                                            {formatValue(newVal)}
                                                        </span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
