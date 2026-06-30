"use client";
import { useRef, useState } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";

export type SavedQuoteListItem = {
    _id: string;
    quote_name?: string;
    scenario?: number;
    num_standees?: number;
    updated_at?: string;
};

const SIDEBAR_INPUT_CLASS =
    "w-full text-[11px] font-semibold text-[#000005] placeholder:text-[#B1B3B6] border-2 border-[#E0E0E0] rounded-sm px-2 py-2 outline-none focus-visible:border-[#FFC843] focus-visible:ring-2 focus-visible:ring-[#FFC843]";

const IconTrash = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
);

const IconPencil = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
);

type Props = {
    projectName: string;
    quotes: SavedQuoteListItem[];
    totalQuoteCount: number;
    isLoading: boolean;
    error: string | null;
    activeQuoteId: string | null;
    deletingQuoteId: string | null;
    searchQuery: string;
    isSignedIn: boolean;
    onSearchChange: (q: string) => void;
    onBuildNewQuote: () => void;
    onOpenQuote: (id: string) => void;
    onDeleteQuote: (id: string, label: string) => void;
    onRenameQuote: (id: string, newName: string) => void;
    onBack: () => void;
};

export default function QuotesSidebar({
    projectName,
    quotes,
    totalQuoteCount,
    isLoading,
    error,
    activeQuoteId,
    deletingQuoteId,
    searchQuery,
    isSignedIn,
    onSearchChange,
    onBuildNewQuote,
    onOpenQuote,
    onDeleteQuote,
    onRenameQuote,
    onBack,
}: Props) {
    const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    function confirmDelete() {
        if (!pendingDelete) return;
        onDeleteQuote(pendingDelete.id, pendingDelete.label);
        setPendingDelete(null);
    }

    function startEdit(id: string, currentName: string) {
        setEditingId(id);
        setEditingName(currentName);
        setTimeout(() => inputRef.current?.select(), 0);
    }

    function commitEdit() {
        if (!editingId) return;
        const trimmed = editingName.trim();
        if (trimmed) onRenameQuote(editingId, trimmed);
        setEditingId(null);
    }

    function cancelEdit() {
        setEditingId(null);
    }

    return (
        <>
        <ConfirmAlert
            visible={pendingDelete !== null}
            message={`Delete "${pendingDelete?.label ?? ""}"? This cannot be undone.`}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
        />
        <aside className="shrink-0 w-[250px] flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3 min-h-0">
            <div className="flex flex-col gap-0.5 pl-3">
                <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#B1B3B6]">
                    {projectName.trim() || "Untitled project"}
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-[1.25em] font-bold text-[#000005]">Quotes</span>
                </div>
            </div>
            <button
                type="button"
                onClick={onBuildNewQuote}
                className="text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200"
            >
                + BUILD NEW QUOTE
            </button>
            <input
                id="sidebar-quote-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search quotes…"
                className={SIDEBAR_INPUT_CLASS}
                autoComplete="off"
            />
            {!isSignedIn && (
                <p className="text-[10px] text-[#B1B3B6] font-semibold leading-snug px-0.5">
                    Sign in to load saved quotes for this project.
                </p>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                {isLoading && (
                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">Loading…</div>
                )}
                {error && (
                    <div className="text-[10px] text-red-500 font-semibold px-1 leading-snug">{error}</div>
                )}
                {!isLoading && isSignedIn && totalQuoteCount === 0 && !error && (
                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">No quotes yet.</div>
                )}
                {!isLoading && isSignedIn && totalQuoteCount > 0 && quotes.length === 0 && searchQuery.trim() && !error && (
                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">No quotes match your search.</div>
                )}
                {quotes.map((q) => {
                    const label     = (q.quote_name || "Untitled").trim();
                    const isActive  = activeQuoteId === q._id;
                    const isEditing = editingId === q._id;
                    return (
                        <div
                            key={q._id}
                            className={`flex items-stretch rounded-md border transition-all duration-200 overflow-hidden ${
                                isActive
                                    ? "border-[#FFC843] bg-[#FFFBEE] shadow-sm"
                                    : "border-[#E8E8E8] bg-white hover:border-[#C8C8C8] hover:shadow-sm"
                            }`}
                        >
                            {/* Left accent bar */}
                            <div className={`w-[3px] shrink-0 transition-all duration-200 ${isActive ? "bg-[#FFC843]" : "bg-transparent"}`} />

                            <button
                                type="button"
                                onClick={() => !isEditing && onOpenQuote(q._id)}
                                disabled={deletingQuoteId !== null}
                                className="cursor-pointer min-w-0 flex-1 text-left px-2.5 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#FFC843] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isEditing ? (
                                    <input
                                        ref={inputRef}
                                        autoFocus
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                            if (e.key === "Escape") cancelEdit();
                                        }}
                                        onBlur={commitEdit}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full text-[13px] font-bold text-[#000005] border-b-2 border-[#FFC843] bg-transparent outline-none leading-tight tracking-tight"
                                    />
                                ) : (
                                    <div className="text-[13px] font-bold text-[#000005] tracking-tight line-clamp-2 leading-tight">
                                        {label}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 mt-1.5">
                                    {typeof q.scenario === "number" && (
                                        <span className="text-[9px] text-[#B1B3B6] font-semibold">Sc. {q.scenario}</span>
                                    )}
                                    {typeof q.num_standees === "number" && (
                                        <span className="text-[9px] text-[#B1B3B6] font-semibold">· {q.num_standees} standees</span>
                                    )}
                                </div>
                            </button>

                            {/* Edit button */}
                            <button
                                type="button"
                                aria-label={`Rename quote ${label}`}
                                disabled={deletingQuoteId !== null}
                                onClick={(e) => { e.stopPropagation(); isEditing ? cancelEdit() : startEdit(q._id, label); }}
                                className={`cursor-pointer shrink-0 w-7 flex items-center justify-center border-l border-[#F0F0F0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                    isEditing ? "text-[#64748B] bg-[#F1F5F9]" : "text-[#DEDEDE] hover:text-[#64748B] hover:bg-[#F1F5F9]"
                                }`}
                            >
                                <IconPencil />
                            </button>

                            {/* Delete button */}
                            <button
                                type="button"
                                aria-label={`Delete quote ${label}`}
                                disabled={deletingQuoteId !== null}
                                onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: q._id, label }); }}
                                className="cursor-pointer shrink-0 w-7 flex items-center justify-center text-[#DEDEDE] hover:text-red-400 hover:bg-red-50 border-l border-[#F0F0F0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <IconTrash />
                            </button>
                        </div>
                    );
                })}
            </div>
            <button
                type="button"
                onClick={onBack}
                className="shrink-0 w-full text-xs font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-2 rounded-sm cursor-pointer hover:bg-[#000005] hover:text-white hover:border-[#000005] transition-all duration-200 uppercase tracking-widest"
            >
                ← TO ESTIMATOR
            </button>
        </aside>
        </>
    );
}
