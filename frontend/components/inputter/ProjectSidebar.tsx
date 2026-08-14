"use client";
import { useRef, useState } from "react";
import ConfirmAlert from "@/components/ConfirmAlert";

export type ProjectSummary = {
    _id: string;
    short_id?: string;
    owner?: string;
    project_name: string;
    num_standees: number;
    standee_counts?: number[];
    standee_type: "Simple" | "Moderate" | "Complex";
    /** True when saved quote costs may be out of date vs data-collector tables. */
    costsStale?: boolean;
};

const SIDEBAR_INPUT_CLASS =
    "w-full text-[11px] font-semibold text-[#000005] placeholder:text-[#B1B3B6] border-2 border-[#E0E0E0] rounded-sm px-2 py-2 outline-none focus-visible:border-[#FFC843] focus-visible:ring-2 focus-visible:ring-[#FFC843]";

const STANDEE_BADGE: Record<string, string> = {
    Simple:   "bg-[#E8F5E9] text-[#2E7D32]",
    Moderate: "bg-[#E3F2FD] text-[#1565C0]",
    Complex:  "bg-[#FFF3E0] text-[#E65100]",
};

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

const IconCopy = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
);

type Props = {
    activeProjectId: string | null;
    currentUser: string | null;
    isAdmin?: boolean;
    projects: ProjectSummary[];
    hasProjects: boolean;
    isLoading: boolean;
    error: string | null;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onNewProject: () => void;
    onLoadProject: (id: string) => void;
    onDeleteProject: (id: string, label: string) => void;
    onRenameProject: (id: string, newName: string) => void;
    onDuplicateProject: (id: string, label: string) => void;
};

export default function ProjectSidebar({
    activeProjectId,
    currentUser,
    isAdmin = false,
    projects,
    hasProjects,
    isLoading,
    error,
    searchQuery,
    onSearchChange,
    onNewProject,
    onLoadProject,
    onDeleteProject,
    onRenameProject,
    onDuplicateProject,
}: Props) {
    const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    function confirmDelete() {
        if (!pendingDelete) return;
        onDeleteProject(pendingDelete.id, pendingDelete.label);
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
        if (trimmed) onRenameProject(editingId, trimmed);
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
        <aside className="shrink-0 w-[350px] h-full min-h-0 flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3">
            <div className="flex flex-col gap-0.5 pl-3 shrink-0">
                <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#B1B3B6]">Your Work</span>
                <div className="flex items-center gap-2">
                    <span className="text-[1.25em] font-bold text-[#000005]">Projects</span>
                </div>
            </div>
            <button
                type="button"
                onClick={onNewProject}
                className="shrink-0 text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200"
            >
                + NEW PROJECT
            </button>
            <input
                id="sidebar-project-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search all projects..."
                className={`shrink-0 ${SIDEBAR_INPUT_CLASS}`}
                autoComplete="off"
            />
            <div className="flex-1 min-h-0 overflow-y-scroll overscroll-contain flex flex-col gap-1.5 pr-0.5 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#C8C8C8] [&::-webkit-scrollbar-track]:bg-[#F0F0F0]">
                {isLoading && projects.length === 0 && (
                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">Loading…</div>
                )}
                {error && (
                    <div className="text-[10px] text-red-500 font-semibold px-1 leading-snug">{error}</div>
                )}
                {!isLoading && !hasProjects && !error && (
                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">No saved projects yet.</div>
                )}
                {!isLoading && hasProjects && projects.length === 0 && searchQuery.trim() && !error && (
                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">No projects match your search.</div>
                )}
                {projects.map((p) => {
                    const isActive  = activeProjectId === p._id;
                    const isEditing = editingId === p._id;
                    const isOwner   = (!!currentUser && p.owner === currentUser) || isAdmin;
                    const isStale   = !!p.costsStale;
                    return (
                        <div
                            key={p._id}
                            title={isStale ? "Cost tables updated — open and recalculate this estimate" : undefined}
                            className={`flex items-stretch rounded-md border transition-all duration-200 overflow-hidden shrink-0 ${
                                isActive
                                    ? isStale
                                        ? "border-red-400 bg-[#FFFBEE] shadow-sm hover:cursor-pointer"
                                        : "border-[#FFC843] bg-[#FFFBEE] shadow-sm hover:cursor-pointer"
                                    : isStale
                                        ? "border-red-200 bg-white hover:border-red-300 hover:shadow-sm hover:cursor-pointer"
                                        : "border-[#E8E8E8] bg-white hover:border-[#C8C8C8] hover:shadow-sm hover:cursor-pointer"
                            }`}
                        >
                            {/* Left accent bar */}
                            <div
                                className={`w-[3px] shrink-0 transition-all duration-200 ${
                                    isStale ? "bg-red-500" : isActive ? "bg-[#FFC843]" : "bg-transparent"
                                }`}
                            />

                            <button
                                type="button"
                                onClick={() => !isEditing && onLoadProject(p._id)}
                                className={`cursor-pointer min-w-0 flex-1 text-left px-2.5 py-2.5 outline-none focus-visible:ring-2 ${
                                    isStale ? "focus-visible:ring-red-300" : "focus-visible:ring-[#FFC843]"
                                }`}
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
                                        {p.project_name || "Untitled"}
                                    </div>
                                )}
                                {p.owner && (
                                    <div className="mt-1 text-[9px] font-bold text-[#64748B] truncate" title={p.owner}>
                                        Created by {p.owner}
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 mt-1.5 whitespace-nowrap overflow-hidden">
                                    {isStale && (
                                        <span className="shrink-0 text-[8.5px] font-black uppercase tracking-wide text-red-700 bg-red-100 rounded-sm px-1 py-0.5">
                                            Costs outdated
                                        </span>
                                    )}
                                    {p.short_id && (
                                        <span className="shrink-0 text-[9px] font-black text-[#8a6d1f] bg-[#FFC843]/20 rounded-sm px-1 py-0.5 tabular-nums">
                                            #{p.short_id}
                                        </span>
                                    )}
                                    <span
                                        title={`${p.standee_counts?.length ? p.standee_counts.join(", ") : p.num_standees} standees`}
                                        className="shrink-0 text-[9px] text-[#B1B3B6] font-semibold"
                                    >
                                        {(p.standee_counts?.length ?? 0) > 1
                                            ? `${p.standee_counts?.length} quantities`
                                            : `${p.standee_counts?.[0] ?? p.num_standees} standees`}
                                    </span>
                                    <span className={`shrink-0 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full ${STANDEE_BADGE[p.standee_type] ?? "bg-[#F0F0F0] text-[#888]"}`}>
                                        {p.standee_type}
                                    </span>
                                </div>
                            </button>



                             {/* Duplicate button */}
                            <button
                                type="button"
                                title="Duplicate Project"
                                aria-label={`Duplicate project ${p.project_name || "Untitled"}`}
                                onClick={(e) => { e.stopPropagation(); onDuplicateProject(p._id, p.project_name || "Untitled"); }}
                                className="cursor-pointer shrink-0 w-7 flex items-center justify-center border-l border-[#F0F0F0] text-[#DEDEDE] hover:text-[#1565C0] hover:bg-[#E3F2FD] transition-colors"
                            >
                                <IconCopy />
                            </button>

                            {/* Edit button — only the owner may rename */}
                            <button
                                type="button"
                                disabled={!isOwner}
                                title={isOwner ? "Edit Project" : "Only the owner or an admin can rename this project"}
                                aria-label={`Rename project ${p.project_name || "Untitled"}`}
                                onClick={(e) => { e.stopPropagation(); if (!isOwner) return; isEditing ? cancelEdit() : startEdit(p._id, p.project_name || "Untitled"); }}
                                className={`shrink-0 w-7 flex items-center justify-center border-l border-[#F0F0F0] transition-colors ${
                                    !isOwner
                                        ? "text-[#E8E8E8] cursor-not-allowed"
                                        : isEditing
                                            ? "cursor-pointer text-[#64748B] bg-[#F1F5F9]"
                                            : "cursor-pointer text-[#DEDEDE] hover:text-[#64748B] hover:bg-[#F1F5F9]"
                                }`}
                            >
                                <IconPencil />
                            </button>

                            {/* Delete button — only the owner may delete */}
                            <button
                                type="button"
                                disabled={!isOwner}
                                title={isOwner ? "Delete Project" : "Only the owner or an admin can delete this project"}
                                aria-label={`Delete project ${p.project_name || "Untitled"}`}
                                onClick={(e) => { e.stopPropagation(); if (!isOwner) return; setPendingDelete({ id: p._id, label: p.project_name || "Untitled" }); }}
                                className={`shrink-0 w-7 flex items-center justify-center border-l border-[#F0F0F0] transition-colors ${
                                    !isOwner
                                        ? "text-[#E8E8E8] cursor-not-allowed"
                                        : "cursor-pointer text-[#DEDEDE] hover:text-red-400 hover:bg-red-50"
                                }`}
                            >
                                <IconTrash />
                            </button>
                        </div>
                    );
                })}
            </div>
        </aside>
        </>
    );
}
