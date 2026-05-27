"use client";

export type ProjectSummary = {
    _id: string;
    project_name: string;
    num_standees: number;
    standee_type: "Simple" | "Moderate" | "Complex";
};

const SIDEBAR_INPUT_CLASS =
    "w-full text-[11px] font-semibold text-[#000005] placeholder:text-[#B1B3B6] border-2 border-[#E0E0E0] rounded-sm px-2 py-2 outline-none focus-visible:border-[#FFC843] focus-visible:ring-2 focus-visible:ring-[#FFC843]";

type Props = {
    activeProjectId: string | null;
    projects: ProjectSummary[];
    hasProjects: boolean;
    isLoading: boolean;
    error: string | null;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onNewProject: () => void;
    onLoadProject: (id: string) => void;
    onDeleteProject: (id: string, label: string) => void;
};

export default function ProjectSidebar({
    activeProjectId,
    projects,
    hasProjects,
    isLoading,
    error,
    searchQuery,
    onSearchChange,
    onNewProject,
    onLoadProject,
    onDeleteProject,
}: Props) {
    return (
        <aside className="shrink-0 w-[220px] flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#000005]">
                <span className="text-[#FFC843]">// </span>PROJECTS
            </div>
            <button
                type="button"
                onClick={onNewProject}
                className="text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200"
            >
                + NEW PROJECT
            </button>
            <input
                id="sidebar-project-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search projects…"
                className={SIDEBAR_INPUT_CLASS}
                autoComplete="off"
            />
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
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
                {projects.map((p) => (
                    <div
                        key={p._id}
                        className={`flex items-stretch gap-1 rounded-sm border-2 transition-all duration-200 ${
                            activeProjectId === p._id
                                ? "border-[#FFC843] bg-[#FFFBF0]"
                                : "border-[#E0E0E0] bg-[#F8F8F8] hover:border-[#B1B3B6]"
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onLoadProject(p._id)}
                            className="min-w-0 flex-1 text-left px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#FFC843]"
                        >
                            <div className="text-[11px] font-black text-[#000005] uppercase tracking-tight line-clamp-2">
                                {p.project_name || "Untitled"}
                            </div>
                            <div className="text-[9px] text-[#B1B3B6] font-bold mt-0.5 uppercase tracking-wider">
                                {p.num_standees} × {p.standee_type}
                            </div>
                        </button>
                        <button
                            type="button"
                            aria-label={`Delete project ${p.project_name || "Untitled"}`}
                            onClick={(e) => { e.stopPropagation(); onDeleteProject(p._id, p.project_name || "Untitled"); }}
                            className="shrink-0 w-8 flex items-center justify-center text-[12px] font-bold text-[#B1B3B6] hover:text-red-600 hover:bg-red-50 border-l-2 border-[#E0E0E0] transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
}
