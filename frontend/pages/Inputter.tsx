"use client";
import ElementsManager from "@/components/ElementsManager";
import Dropdown from "@/components/Dropdown";
import QuoteBreakdown from "@/components/QuoteBreakdown";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";

type StandeeType = "Simple" | "Moderate" | "Complex";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
};

export type QuoteData = Record<string, Record<string, number>>;

export type RequestPayload = {
    elements: { name: string; height: number; width: number; complexity: string; linear_inches: number | null }[];
    num_standees: number;
    standee_type: number;
};

// information that gets displayed in the projects sidebar
type PersistedProjectSummary = {
    _id: string;
    project_name: string;
    num_standees: number;
    standee_type: StandeeType;
};

// converts the inputted elements array into a format that can be stored in the MongoDB
function buildElementsForApi(elements: Element[]) {
    return elements.map((el) => ({
        name: "",
        length: el.height === "" ? 0 : el.height,
        width: el.width === "" ? 0 : el.width,
        linear_inches: el.linear_inches === "" ? null : el.linear_inches,
        complexity: el.complexity as StandeeType,
    }));
}

export default function Inputter() {
    const [standeeCount, setStandeeCount] = useState<number | "">("");
    const [standeeType, setStandeeType] = useState<StandeeType>("Simple");
    const [elements, setElements] = useState<Element[]>([]);
    const [resetKey, setResetKey] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [lastPayload, setLastPayload] = useState<RequestPayload | null>(null);

    const [projectName, setProjectName] = useState("Untitled project");
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [projects, setProjects] = useState<PersistedProjectSummary[]>([]);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [projectsError, setProjectsError] = useState<string | null>(null);
    const [listVersion, setListVersion] = useState(0);

    const refreshProjects = useCallback(async () => {
        const owner = typeof window !== "undefined" ? localStorage.getItem("username") : null;
        if (!owner) {
            setProjects([]);
            return;
        }
        setProjectsLoading(true);
        setProjectsError(null);
        try {
            const res = await fetch(`${API_BASE}/projects?owner=${encodeURIComponent(owner)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProjectsError(typeof data.error === "string" ? data.error : "Could not load projects");
                setProjects([]);
                return;
            }
            setProjects(Array.isArray(data.projects) ? data.projects : []);
        } catch {
            setProjectsError("Could not load projects");
            setProjects([]);
        } finally {
            setProjectsLoading(false);
        }
    }, []);

    useEffect(() => {
        void refreshProjects();
    }, [refreshProjects, listVersion]);

    function handleClear() {
        setStandeeCount("");
        setStandeeType("Simple");
        setElements([]);
        setResetKey((k) => k + 1);
        setProjectName("Untitled project");
        setActiveProjectId(null);
    }

    // TODO: Implement blue upload
    function handleBlueUpload() {
        console.log("Uploading blue...");
    }

    function handleNewProject() {
        handleClear();
    }

    async function loadProject(projectId: string) {
        const owner = localStorage.getItem("username");
        if (!owner) return;
        setProjectsLoading(true);
        setProjectsError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}?owner=${encodeURIComponent(owner)}`,
            );
            const doc = await res.json();
            if (!res.ok) {
                setProjectsError(typeof doc.error === "string" ? doc.error : "Could not load project");
                return;
            }
            setActiveProjectId(doc._id);
            setProjectName(typeof doc.project_name === "string" ? doc.project_name : "Untitled project");
            setStandeeType((doc.standee_type as StandeeType) || "Simple");
            setStandeeCount(typeof doc.num_standees === "number" ? doc.num_standees : "");
            const rows = Array.isArray(doc.elements) ? doc.elements : [];
            setElements(
                rows.map((row: { length: number; width: number; complexity: string; linear_inches: number | null }, i: number) => ({
                    id: Date.now() + i,
                    height: row.length,
                    width: row.width,
                    complexity: row.complexity || "Simple",
                    linear_inches:
                        row.linear_inches === null || row.linear_inches === undefined ? "" : row.linear_inches,
                })),
            );
            setResetKey((k) => k + 1);
        } catch {
            setProjectsError("Could not load project");
        } finally {
            setProjectsLoading(false);
        }
    }

    async function deleteProject(projectId: string, projectLabel: string) {
        if (!window.confirm(`Are you sure you want to delete "${projectLabel}"? This action cannot be undone.`)) {
            return;
        }
        const owner = localStorage.getItem("username");
        if (!owner) {
            return;
        }
        setProjectsError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}?owner=${encodeURIComponent(owner)}`,
                { method: "DELETE" },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProjectsError(typeof data.error === "string" ? data.error : "Could not delete project");
                return;
            }
            if (activeProjectId === projectId) {
                handleClear();
            }
            setListVersion((v) => v + 1);
        } catch {
            setProjectsError("Could not delete project");
        }
    }

    const canCalculate = (standeeCount !== "" && standeeCount > 0) && elements.length > 0;
    const canPersist = canCalculate;

    async function handleSave() {
        if (!canPersist) return;
        const owner = localStorage.getItem("username");
        if (!owner) return;
        const num = standeeCount as number;
        const apiElements = buildElementsForApi(elements);

        try {
            if (activeProjectId) {
                const body = {
                    project_name: projectName.trim() || "Untitled project",
                    num_standees: num,
                    standee_type: standeeType,
                    elements: apiElements,
                };
                const res = await fetch(
                    `${API_BASE}/projects/${encodeURIComponent(activeProjectId)}?owner=${encodeURIComponent(owner)}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    },
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    console.error(data);
                    return;
                }
            } else {
                const body = {
                    schema_version: 1,
                    owner,
                    project_name: projectName.trim() || "Untitled project",
                    num_standees: num,
                    standee_type: standeeType,
                    elements: apiElements,
                };
                const res = await fetch(`${API_BASE}/create-project`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    console.error(data);
                    return;
                }
                if (typeof data.project_id === "string") setActiveProjectId(data.project_id);
            }
            setListVersion((v) => v + 1);
        } catch (e) {
            console.error("Save failed:", e);
        }
    }

    function handleQuoteGeneration() {
        const standeeTypeMap: Record<StandeeType, number> = { Simple: 1, Moderate: 2, Complex: 3 };
        const corePayload: RequestPayload = {
            standee_type: standeeTypeMap[standeeType],
            elements: elements.map(({ height, width, complexity, linear_inches }) => ({
                name: "",
                height: height === "" ? 0 : height,
                width: width === "" ? 0 : width,
                complexity,
                linear_inches: linear_inches === "" ? null : linear_inches,
            })),
            num_standees: standeeCount === "" ? 0 : standeeCount,
        };
        const payload: Record<string, unknown> = {
            ...corePayload,
            project_name: projectName.trim() || "Untitled project",
        };
        if (typeof window !== "undefined") {
            const owner = localStorage.getItem("username");
            if (owner) payload.owner = owner;
            if (activeProjectId) payload.project_id = activeProjectId;
        }

        setIsLoading(true);
        fetch(`${API_BASE}/generate_quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    console.error("Quote error:", data);
                    return;
                }
                console.log(data);
                if (typeof data.project_id === "string") setActiveProjectId(data.project_id);
                setListVersion((v) => v + 1);
                setLastPayload(corePayload);
                setQuoteData(data);
            })
            .catch((error) => console.error("Error generating quote:", error))
            .finally(() => setIsLoading(false));
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center w-full flex-1 bg-white">
                <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-2">// PROCESSING</div>
                <div className="text-3xl font-black text-[#000005] uppercase tracking-tight mb-6">
                    Calculating Quote
                </div>
                <div className="flex gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce" />
                </div>
            </div>
        );
    }

    if (quoteData && lastPayload) {
        return (
            <QuoteBreakdown
                quoteData={quoteData}
                numStandees={standeeCount === "" ? 0 : standeeCount}
                requestPayload={lastPayload}
                onBack={() => setQuoteData(null)}
            />
        );
    }

    return (
        <div className="flex flex-row w-full flex-1 min-h-0 overflow-hidden bg-[#F8F8F8]">
            {/* Projects sidebar */}
            <aside className="shrink-0 w-[220px] flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#000005]">
                    <span className="text-[#FFC843]">// </span>PROJECTS
                </div>
                <button
                    type="button"
                    onClick={handleNewProject}
                    className="text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200"
                >
                    + NEW PROJECT
                </button>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                    {projectsLoading && projects.length === 0 && (
                        <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">Loading…</div>
                    )}
                    {projectsError && (
                        <div className="text-[10px] text-red-500 font-semibold px-1 leading-snug">{projectsError}</div>
                    )}
                    {!projectsLoading && projects.length === 0 && !projectsError && (
                        <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">No saved projects yet.</div>
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
                                onClick={() => void loadProject(p._id)}
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteProject(p._id, p.project_name || "Untitled");
                                }}
                                className="shrink-0 w-8 flex items-center justify-center text-[12px] font-bold text-[#B1B3B6] hover:text-red-600 hover:bg-red-50 border-l-2 border-[#E0E0E0] transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main estimator */}
            <div className="flex flex-col items-center flex-1 min-w-0 overflow-y-auto px-8 py-6">
                <div className="w-full max-w-2xl mb-4 shrink-0">
                    <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// ESTIMATOR</div>
                    <div className="text-3xl font-black text-[#000005] uppercase tracking-tight">Quote Estimate</div>
                    <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">
                        Configure parameters to generate a cost estimate
                    </p>
                </div>

                <div className="flex flex-col w-full max-w-3xl flex-1 min-h-0 border-2 bg-white border-[#E0E0E0] rounded-md text-[#B1B3B6] overflow-hidden">
                    <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#E0E0E0] shrink-0">
                        <div className="text-[10px] font-black mb-3 uppercase tracking-widest text-[#000005]">
                            <span className="text-[#FFC843]">// </span>01 — COUNTS
                        </div>
                        <div className="flex flex-col gap-4 w-full">
                            <div className="w-full">
                                <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">
                                    Project name
                                </div>
                                <input
                                    type="text"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    placeholder="Untitled project"
                                    className="border-2 border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-full max-w-md bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                                />
                            </div>
                            <div className="flex flex-row gap-8 w-full flex-wrap">
                                <div>
                                    <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">
                                        Standee Type
                                    </div>
                                    <Dropdown
                                        key={resetKey}
                                        options={["Simple", "Moderate", "Complex"]}
                                        currOption={standeeType}
                                        onSelect={(val: StandeeType) => setStandeeType(val)}
                                    />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">
                                        Standee Count
                                    </div>
                                    <input
                                        type="number"
                                        min={0}
                                        value={standeeCount}
                                        onChange={(e) =>
                                            setStandeeCount(e.target.value === "" ? "" : Number(e.target.value))
                                        }
                                        placeholder="0"
                                        className="border-2 border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-[200px] bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col flex-1 min-h-0 items-start w-full p-4 border-b-2 border-[#E0E0E0] overflow-hidden">
                        <div className="text-[10px] font-black mb-3 uppercase tracking-widest text-[#000005]">
                            <span className="text-[#FFC843]">// </span>02 — ELEMENTS
                            <span className="ml-2 text-[#FFC843] font-bold">({elements.length} added)</span>
                        </div>
                        <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                            <ElementsManager key={resetKey} elements={elements} setElements={setElements} />
                        </div>
                    </div>

                    <div className="flex w-full flex-row items-center px-4 py-3 gap-3 shrink-0 flex-wrap">
                        <div
                            onClick={handleClear}
                            className="text-xs text-center font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-3 rounded-sm flex-1 min-w-[100px] cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200 uppercase tracking-widest"
                        >
                            CLEAR
                        </div>
                        <div
                            onClick={handleBlueUpload}
                            className="text-xs text-center font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-3 rounded-sm flex-1 min-w-[100px] cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200 uppercase tracking-widest"
                        >
                            UPLOAD BLUE
                        </div>
                        <div
                            onClick={canPersist ? () => void handleSave() : undefined}
                            className={`text-xs text-center font-black py-3 rounded-sm flex-1 min-w-[100px] transition-all duration-200 uppercase tracking-widest ${
                                canPersist
                                    ? "border-2 border-[#000005] text-[#000005] bg-white hover:bg-[#F4F4F4] cursor-pointer"
                                    : "border-2 border-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                            }`}
                        >
                            SAVE
                        </div>
                        <div
                            onClick={canCalculate ? handleQuoteGeneration : undefined}
                            className={`group flex flex-row justify-center gap-4 text-xs font-black py-3 rounded-sm flex-[2] min-w-[180px] transition-all duration-200 ease-in-out uppercase tracking-widest ${
                                canCalculate
                                    ? "bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white cursor-pointer"
                                    : "bg-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                            }`}
                        >
                            CONTINUE{" "}
                            <img
                                src="/submitarrow.svg"
                                alt=""
                                className={`transition-all duration-300 ease-in-out ${canCalculate ? "group-hover:translate-x-1 group-hover:invert" : "opacity-40"}`}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
