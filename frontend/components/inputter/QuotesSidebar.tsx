"use client";
import { useState } from "react";
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

type Props = {
    projectName: string;
    quotes: SavedQuoteListItem[];   // already filtered by search query
    totalQuoteCount: number;        // unfiltered count — used to distinguish "no quotes" vs "no match"
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
    onBack,
}: Props) {
    const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);

    function confirmDelete() {
        if (!pendingDelete) return;
        onDeleteQuote(pendingDelete.id, pendingDelete.label);
        setPendingDelete(null);
    }

    return (
        <>
        <ConfirmAlert
            visible={pendingDelete !== null}
            message={`Delete "${pendingDelete?.label ?? ""}"? This cannot be undone.`}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
        />
        <aside className="shrink-0 w-[220px] flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3 min-h-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#000005]">
                <span className="text-[#FFC843]">// </span>QUOTES
            </div>
            <div className="text-[11px] font-black text-[#000005] uppercase tracking-tight line-clamp-3 break-words px-0.5">
                {projectName.trim() || "Untitled project"}
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
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6] px-0.5">
                Saved on this project
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 -mx-0.5 px-0.5">
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
                    const label = (q.quote_name || "Untitled").trim();
                    return (
                        <div
                            key={q._id}
                            className={`flex items-stretch gap-1 rounded-sm border-2 transition-all duration-200 ${
                                activeQuoteId === q._id
                                    ? "border-[#FFC843] bg-[#FFFBF0]"
                                    : "border-[#E0E0E0] bg-[#F8F8F8] hover:border-[#B1B3B6]"
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => onOpenQuote(q._id)}
                                disabled={deletingQuoteId !== null}
                                className="min-w-0 flex-1 text-left px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#FFC843] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <div className="text-[11px] font-black text-[#000005] uppercase tracking-tight line-clamp-3 break-words">
                                    {label}
                                </div>
                                <div className="text-[9px] text-[#B1B3B6] font-bold mt-0.5 uppercase tracking-wider">
                                    {typeof q.scenario === "number" ? `Sc. ${q.scenario}` : ""}
                                    {typeof q.num_standees === "number" ? ` · ${q.num_standees} standees` : ""}
                                </div>
                            </button>
                            <button
                                type="button"
                                aria-label={`Delete quote ${label}`}
                                disabled={deletingQuoteId !== null}
                                onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: q._id, label }); }}
                                className="shrink-0 w-8 flex items-center justify-center text-[12px] font-bold text-[#B1B3B6] hover:text-red-600 hover:bg-red-50 border-l-2 border-[#E0E0E0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                ✕
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
