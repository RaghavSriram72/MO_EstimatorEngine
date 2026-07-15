"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/config";

type ChangeType = "create" | "update" | "rename" | "revert";
type EntityType = "project" | "quote";

type HistoryEntry = {
    _id: string;
    project_id: string;
    entity_type: EntityType;
    quote_id: string | null;
    scenario: number | null;
    change_type: ChangeType;
    changed_by: string;
    label: string;
    created_at: string;
    reverted_from_history_id: string | null;
};

type HistoryEntryDetail = HistoryEntry & { snapshot: Record<string, unknown> };

type Props = {
    open: boolean;
    onClose: () => void;
    projectId: string;
    owner: string;
    onReverted: (entityType: EntityType, label: string) => void;
};

const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
    create: "Created",
    update: "Updated",
    rename: "Renamed",
    revert: "Reverted",
};

const CHANGE_TYPE_STYLE: Record<ChangeType, string> = {
    create: "bg-[#E8F5E9] text-[#2E7D32]",
    update: "bg-[#E3F2FD] text-[#1565C0]",
    rename: "bg-[#F3E5F5] text-[#6A1B9A]",
    revert: "bg-[#FFF3E0] text-[#E65100]",
};

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (diffSec < 60) return "just now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return new Date(iso).toLocaleDateString();
}

function fieldLabel(key: string): string {
    return key
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function IconChevron({ className = "" }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

/** Key identifying "the same thing over time" — the project itself, or one specific quote. */
function entityKey(entry: HistoryEntry): string {
    return entry.entity_type === "project" ? "project" : `quote:${entry.quote_id}`;
}

type DiffRow = { key: string; path: string; before: unknown; after: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    return false;
}

function isPrimitive(v: unknown): boolean {
    return v === null || v === undefined || typeof v !== "object";
}

/** Top-level only — a quote/project's important fields, not a line-by-line cost breakdown. */
function diffTopLevel(before: Record<string, unknown>, after: Record<string, unknown>): DiffRow[] {
    const rows: DiffRow[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
        const b = before[k];
        const a = after[k];
        if (!deepEqual(b, a)) rows.push({ key: k, path: fieldLabel(k), before: b, after: a });
    }
    return rows;
}

function formatDiffValue(v: unknown): string {
    if (v === undefined || v === null) return "—";
    if (typeof v === "object") return "";
    const s = String(v);
    return s.length > 50 ? `${s.slice(0, 47)}…` : s;
}

type ElementRow = { length?: unknown; width?: unknown; complexity?: unknown; description?: unknown };

function describeElement(el: unknown): string {
    if (!isPlainObject(el)) return "element";
    const e = el as ElementRow;
    const dims = e.length !== undefined && e.width !== undefined ? `${e.length}×${e.width}` : "";
    const base = [dims, e.complexity].filter(Boolean).join(" ") || "element";
    const description = typeof e.description === "string" ? e.description.trim() : "";
    return description ? `${base} — ${description}` : base;
}

/** Elements are (almost always) appended/removed at the end via the "+ Add" / delete row
 * controls, so a length-based comparison is enough to surface "what's new" without full
 * list-diffing — good enough for a summary, not meant to handle arbitrary reordering. */
function summarizeElementsChange(before: unknown, after: unknown): { summary: string; tone: "added" | "removed" | "changed"; details: string[] } {
    if (!Array.isArray(before) || !Array.isArray(after)) {
        return { summary: "Changed", tone: "changed", details: [] };
    }
    if (after.length > before.length) {
        const added = after.slice(before.length);
        return {
            summary: `+${added.length} element${added.length === 1 ? "" : "s"} added`,
            tone: "added",
            details: added.map(describeElement),
        };
    }
    if (after.length < before.length) {
        const removed = before.slice(after.length);
        return {
            summary: `-${removed.length} element${removed.length === 1 ? "" : "s"} removed`,
            tone: "removed",
            details: removed.map(describeElement),
        };
    }
    return { summary: `${after.length} element${after.length === 1 ? "" : "s"} edited`, tone: "changed", details: [] };
}

const ELEMENTS_DIFF_STYLE: Record<"added" | "removed" | "changed", string> = {
    added: "bg-[#E8F5E9] text-[#2E7D32]",
    removed: "bg-[#FDECEA] text-[#C62828]",
    changed: "bg-[#E3F2FD] text-[#1565C0]",
};

export default function HistoryModal({ open, onClose, projectId, owner, onReverted }: Props) {
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);

    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<HistoryEntryDetail | null>(null);
    const [currentDetail, setCurrentDetail] = useState<HistoryEntryDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [confirmingRevertId, setConfirmingRevertId] = useState<string | null>(null);
    const [reverting, setReverting] = useState(false);
    const [revertError, setRevertError] = useState<string | null>(null);

    // The newest entry for each distinct thing (the project itself, or one specific quote)
    // is that thing's current live version.
    const currentEntryIds = useMemo(() => {
        const seenKeys = new Set<string>();
        const current = new Set<string>();
        for (const entry of entries) {
            const key = entityKey(entry);
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                current.add(entry._id);
            }
        }
        return current;
    }, [entries]);

    const isSelectedEntryCurrent = detail ? currentEntryIds.has(detail._id) : false;

    const diffRows = useMemo(() => {
        if (!detail || !currentDetail || isSelectedEntryCurrent) return [];
        return diffTopLevel(detail.snapshot, currentDetail.snapshot);
    }, [detail, currentDetail, isSelectedEntryCurrent]);

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

    // Guards against an older in-flight request resolving after a newer one and clobbering
    // fresher state (e.g. a stale response landing after a post-revert refetch, which would
    // otherwise make an old entry's "Current version" badge reappear).
    const fetchSeq = useRef(0);

    async function fetchHistory() {
        const seq = ++fetchSeq.current;
        setLoading(true);
        setListError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}/history?owner=${encodeURIComponent(owner)}`,
            );
            const data = await res.json().catch(() => ({}));
            if (seq !== fetchSeq.current) return;
            if (!res.ok) {
                setListError(typeof data?.error === "string" ? data.error : "Could not load history");
                setEntries([]);
                return;
            }
            setEntries(Array.isArray(data.history) ? data.history : []);
        } catch {
            if (seq !== fetchSeq.current) return;
            setListError("Could not load history");
            setEntries([]);
        } finally {
            if (seq === fetchSeq.current) setLoading(false);
        }
    }

    useEffect(() => {
        if (open && projectId) {
            setSelectedId(null);
            setDetail(null);
            setCurrentDetail(null);
            setConfirmingRevertId(null);
            setRevertError(null);
            void fetchHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, projectId]);

    async function fetchHistoryDetail(id: string): Promise<HistoryEntryDetail | null> {
        const res = await fetch(
            `${API_BASE}/projects/${encodeURIComponent(projectId)}/history/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}`,
        );
        const data = await res.json().catch(() => ({}));
        return res.ok ? (data as HistoryEntryDetail) : null;
    }

    async function selectEntry(id: string) {
        if (selectedId === id) {
            setSelectedId(null);
            setDetail(null);
            setCurrentDetail(null);
            return;
        }
        setSelectedId(id);
        setDetail(null);
        setCurrentDetail(null);
        setDetailLoading(true);
        try {
            const entry = entries.find((e) => e._id === id);
            const key = entry ? entityKey(entry) : null;
            const currentId = key
                ? (entries.find((e) => currentEntryIds.has(e._id) && entityKey(e) === key)?._id ?? null)
                : null;
            const needsComparison = currentId !== null && currentId !== id;

            const [selfDetail, curDetail] = await Promise.all([
                fetchHistoryDetail(id),
                needsComparison ? fetchHistoryDetail(currentId!) : Promise.resolve(null),
            ]);
            setDetail(selfDetail);
            setCurrentDetail(curDetail);
        } finally {
            setDetailLoading(false);
        }
    }

    async function revertTo(entry: HistoryEntry) {
        setReverting(true);
        setRevertError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}/history/${encodeURIComponent(entry._id)}/revert?owner=${encodeURIComponent(owner)}`,
                { method: "POST" },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setRevertError(typeof data?.error === "string" ? data.error : "Could not revert");
                return;
            }
            const revertedDoc = (data.doc ?? {}) as Record<string, unknown>;
            const label =
                data.entity_type === "project"
                    ? String(revertedDoc.project_name ?? "Project")
                    : `${String(revertedDoc.quote_name ?? "Quote")} — Scenario ${String(revertedDoc.scenario ?? "")}`;
            setConfirmingRevertId(null);
            onReverted(data.entity_type as EntityType, label);
            if (data.entity_type === "project") {
                onClose();
            } else {
                setSelectedId(null);
                setDetail(null);
                setCurrentDetail(null);
                void fetchHistory();
            }
        } catch {
            setRevertError("Could not revert");
        } finally {
            setReverting(false);
        }
    }

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
                aria-labelledby="history-modal-title"
                className={`w-full max-w-4xl h-[85vh] border-2 border-[#000005] bg-white rounded-sm p-7 flex flex-col gap-4 ${
                    visible ? "modal-slide-up" : "modal-slide-down"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-black text-[#FFC843] tracking-widest uppercase mb-1">
                            // HISTORY
                        </div>
                        <h2
                            id="history-modal-title"
                            className="text-xl font-black text-[#000005] uppercase tracking-tight"
                        >
                            Quote history
                        </h2>
                        <p className="text-[11px] text-[#B1B3B6] font-semibold mt-1">
                            Every save creates a new entry. Reverting keeps a full record — nothing is deleted.
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
                    {listError && <div className="text-[11px] text-red-500 font-semibold px-1 py-2">{listError}</div>}
                    {!loading && !listError && entries.length === 0 && (
                        <div className="text-[11px] text-[#B1B3B6] font-semibold px-1 py-4">
                            No history yet — history starts recording from now.
                        </div>
                    )}
                    {entries.map((entry) => {
                        const isSelected = selectedId === entry._id;
                        const isConfirming = confirmingRevertId === entry._id;
                        const isCurrent = currentEntryIds.has(entry._id);
                        return (
                            <div
                                key={entry._id}
                                className={`rounded-sm border-2 transition-colors duration-200 ${
                                    isSelected ? "border-[#FFC843] bg-[#FFFBEE]" : "border-[#E0E0E0] bg-white"
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => void selectEntry(entry._id)}
                                    aria-expanded={isSelected}
                                    className={`group w-full text-left px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-colors duration-150 ${
                                        isSelected ? "" : "hover:bg-[#FAFAFA]"
                                    }`}
                                >
                                    <span
                                        className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                            entry.entity_type === "project"
                                                ? "bg-[#000005] text-white"
                                                : "bg-[#F0F0F0] text-[#000005]"
                                        }`}
                                    >
                                        {entry.entity_type === "project"
                                            ? "Project"
                                            : `Quote · Scenario ${entry.scenario ?? "?"}`}
                                    </span>
                                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${CHANGE_TYPE_STYLE[entry.change_type]}`}>
                                        {CHANGE_TYPE_LABEL[entry.change_type]}
                                    </span>
                                    {isCurrent && (
                                        <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#FFC843] text-[#000005]">
                                            Current version
                                        </span>
                                    )}
                                    <span className="min-w-0 flex-1 text-[12px] font-bold text-[#000005] truncate">
                                        {entry.label}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-[#B1B3B6] font-semibold">
                                        {entry.changed_by}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-[#B1B3B6] font-semibold w-16 text-right">
                                        {relativeTime(entry.created_at)}
                                    </span>
                                    <IconChevron
                                        className={`shrink-0 text-[#B1B3B6] group-hover:text-[#000005] transition-transform duration-300 ${
                                            isSelected ? "rotate-180" : "rotate-0"
                                        }`}
                                    />
                                </button>

                                <div
                                    className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                                        isSelected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                    }`}
                                >
                                    <div className="overflow-hidden">
                                        <div className="px-3 pb-3 border-t-2 border-[#F0F0F0] pt-2.5 flex flex-col gap-2">
                                            {detailLoading && isSelected && (
                                                <div className="text-[11px] text-[#B1B3B6] font-semibold">Loading details…</div>
                                            )}
                                            {isSelected && !detailLoading && detail && detail._id === entry._id && (
                                                isCurrent ? (
                                                    <div className="text-[11px] text-[#B1B3B6] font-semibold italic">
                                                        This is the current version.
                                                    </div>
                                                ) : currentDetail === null ? (
                                                    <div className="text-[11px] text-red-500 font-semibold">
                                                        Could not load a comparison against the current version.
                                                    </div>
                                                ) : diffRows.length === 0 ? (
                                                    <div className="text-[11px] text-[#B1B3B6] font-semibold italic">
                                                        No differences from the current version.
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="text-[9px] font-black uppercase tracking-wider text-[#B1B3B6] mb-1">
                                                            Changes vs. current version
                                                        </div>
                                                        <div className="flex flex-col">
                                                            {diffRows.map((row, i) => {
                                                                const scalar = isPrimitive(row.before) && isPrimitive(row.after);
                                                                const elementsChange =
                                                                    row.key === "elements" ? summarizeElementsChange(row.before, row.after) : null;
                                                                return (
                                                                    <div
                                                                        key={i}
                                                                        className="flex items-start justify-between gap-3 text-[11px] border-b border-[#F4F4F4] py-1"
                                                                    >
                                                                        <span className="text-[#B1B3B6] font-bold shrink-0 w-2/5 truncate pt-0.5" title={row.path}>
                                                                            {row.path}
                                                                        </span>
                                                                        {elementsChange ? (
                                                                            <span className="flex-1 flex flex-col items-end gap-1 min-w-0">
                                                                                <span
                                                                                    className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${ELEMENTS_DIFF_STYLE[elementsChange.tone]}`}
                                                                                >
                                                                                    {elementsChange.summary}
                                                                                </span>
                                                                                {elementsChange.details.length > 0 && (
                                                                                    <span className="text-[#000005] font-semibold text-right leading-tight">
                                                                                        {elementsChange.details.map((d, di) => (
                                                                                            <div key={di}>{d}</div>
                                                                                        ))}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        ) : scalar ? (
                                                                            <span className="flex-1 flex items-center gap-1.5 justify-end min-w-0">
                                                                                <span className="text-red-500 line-through font-semibold truncate max-w-[45%]" title={formatDiffValue(row.before)}>
                                                                                    {formatDiffValue(row.before)}
                                                                                </span>
                                                                                <span className="text-[#B1B3B6] shrink-0">→</span>
                                                                                <span className="text-[#2E7D32] font-bold truncate max-w-[45%]" title={formatDiffValue(row.after)}>
                                                                                    {formatDiffValue(row.after)}
                                                                                </span>
                                                                            </span>
                                                                        ) : (
                                                                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#E3F2FD] text-[#1565C0]">
                                                                                Modified
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                            {!isCurrent && (
                                                isConfirming ? (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <span className="text-[11px] font-bold text-[#000005] flex-1">
                                                            Revert to this version?
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={reverting}
                                                            onClick={() => setConfirmingRevertId(null)}
                                                            className="text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-sm border-2 border-[#E0E0E0] text-[#B1B3B6] hover:bg-[#F4F4F4] hover:text-[#000005] transition-all duration-200"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={reverting}
                                                            onClick={() => void revertTo(entry)}
                                                            className="text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-sm border-2 border-[#000005] bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white transition-all duration-200 disabled:opacity-60"
                                                        >
                                                            {reverting ? "Reverting…" : "Confirm revert"}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setConfirmingRevertId(entry._id); setRevertError(null); }}
                                                        className="self-start text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-sm border-2 border-[#000005] text-[#000005] bg-white hover:bg-[#F4F4F4] transition-all duration-200"
                                                    >
                                                        Revert to this version
                                                    </button>
                                                )
                                            )}
                                            {isConfirming && revertError && (
                                                <div className="text-[10px] text-red-500 font-semibold">{revertError}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
