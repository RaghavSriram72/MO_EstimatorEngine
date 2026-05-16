"use client";
import ElementsManager from "@/components/ElementsManager";
import Dropdown from "@/components/Dropdown";
import QuoteBreakdown from "@/components/QuoteBreakdown";
import BuildQuoteModal from "@/components/BuildQuoteModal";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/config";

type StandeeType = "Simple" | "Moderate" | "Complex";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
    description: string | "";
};

/** Persisted subtotal override strings keyed by scenario id "1" … "5". */
export type QuoteBreakdownUi = {
    universal_subtotal_override?: Record<string, string>;
    scenario_subtotal_override?: Record<string, string>;
};

/** Scenario blobs (`scenario_*`) plus optional UI overrides from Mongo. */
export type QuoteData = {
    [key: string]: Record<string, number> | QuoteBreakdownUi | undefined;
};

export type RequestPayload = {
    elements: { name: string; height: number; width: number; complexity: string; linear_inches: number | null; description: string | null}[];
    num_standees: number;
    standee_type: number;
    scenario?: number;
};

type QuoteScenarioId = 1 | 2 | 3 | 4 | 5;

type PersistedQuoteListItem = {
    _id: string;
    quote_name?: string;
    scenario?: number;
    num_standees?: number;
    updated_at?: string;
};

type ApiPersistedElement = {
    name?: string;
    length: number;
    width: number;
    linear_inches?: number | null;
    complexity: string;
};


// information that gets displayed in the projects sidebar
type PersistedProjectSummary = {
    _id: string;
    project_name: string;
    num_standees: number;
    standee_type: StandeeType;
};

// converts the inputted elements array into a format that can be stored in the MongoDB
function quoteDataFromGenerateResponse(data: Record<string, unknown>): QuoteData {
    const out: QuoteData = {};
    for (const key of Object.keys(data)) {
        if (key.startsWith("scenario_")) {
            out[key] = data[key] as Record<string, number>;
        }
    }
    return out;
}

function quoteDataFromPersistedBreakdown(breakdown: unknown): QuoteData {
    const out: QuoteData = {};
    if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return out;
    const b = breakdown as Record<string, unknown>;
    for (const [key, val] of Object.entries(b)) {
        if (!key.startsWith("scenario_")) continue;
        if (val && typeof val === "object" && !Array.isArray(val)) {
            out[key] = val as Record<string, number>;
        }
    }
    const ui = b._breakdown_ui;
    if (ui && typeof ui === "object" && !Array.isArray(ui)) {
        out._breakdown_ui = ui as QuoteBreakdownUi;
    }
    return out;
}

function requestPayloadFromQuoteDoc(
    doc: {
        scenario?: number;
        num_standees?: number;
        standee_type?: string;
        elements?: ApiPersistedElement[];
    },
    fallback: { elements: Element[]; standeeType: StandeeType; standeeCount: number | "" },
): RequestPayload {
    const standeeTypeMap: Record<StandeeType, number> = { Simple: 1, Moderate: 2, Complex: 3 };
    const srcRows =
        Array.isArray(doc.elements) && doc.elements.length > 0
            ? doc.elements
            : fallback.elements.map((el) => ({
                  name: "",
                  length: el.height === "" ? 0 : el.height,
                  width: el.width === "" ? 0 : el.width,
                  linear_inches: el.linear_inches === "" ? null : el.linear_inches,
                  complexity: el.complexity,
              }));
    const num =
        typeof doc.num_standees === "number" && doc.num_standees >= 1
            ? doc.num_standees
            : fallback.standeeCount === "" || fallback.standeeCount < 1
              ? 1
              : fallback.standeeCount;
    const st = (doc.standee_type as StandeeType) || fallback.standeeType;
    return {
        elements: srcRows.map((e) => ({
            name: e.name ?? "",
            height: e.length,
            width: e.width,
            complexity: e.complexity as StandeeType,
            linear_inches: e.linear_inches ?? null,
        })),
        num_standees: num,
        standee_type: standeeTypeMap[st] ?? 1,
        scenario:
            typeof doc.scenario === "number" && doc.scenario >= 1 && doc.scenario <= 5
                ? (doc.scenario as QuoteScenarioId)
                : undefined,
    };
}

function buildElementsForApi(elements: Element[]) {
    return elements.map((el) => ({
        name: "",
        length: el.height === "" ? 0 : el.height,
        width: el.width === "" ? 0 : el.width,
        linear_inches: el.linear_inches === "" ? null : el.linear_inches,
        complexity: el.complexity as StandeeType,
        description: el.description || "",
    }));
}

function sidebarSearchMatches(query: string, haystack: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const blob = haystack.toLowerCase();
    for (const term of q.split(/\s+/)) {
        if (!term) continue;
        if (!blob.includes(term)) return false;
    }
    return true;
}

const SIDEBAR_SEARCH_INPUT_CLASS =
    "w-full text-[11px] font-semibold text-[#000005] placeholder:text-[#B1B3B6] border-2 border-[#E0E0E0] rounded-sm px-2 py-2 outline-none focus-visible:border-[#FFC843] focus-visible:ring-2 focus-visible:ring-[#FFC843]";

function persistApiFailureMessage(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    const d = o.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
        for (const item of d) {
            if (item && typeof item === "object" && typeof (item as { msg?: unknown }).msg === "string") {
                return (item as { msg: string }).msg;
            }
        }
    }
    return null;
}

export default function Inputter() {
    const [standeeCount, setStandeeCount] = useState<number | "">("");
    const [standeeType, setStandeeType] = useState<StandeeType>("Simple");
    const [elements, setElements] = useState<Element[]>([]);
    const [resetKey, setResetKey] = useState(0);
    const [projectName, setProjectName] = useState("Untitled project");
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [projects, setProjects] = useState<PersistedProjectSummary[]>([]);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [projectsError, setProjectsError] = useState<string | null>(null);
    const [listVersion, setListVersion] = useState(0);
    /** After Continue: same layout as quote breakdown (scenario sidebar + blank main); no API call. */
    const [quoteFlowShellOpen, setQuoteFlowShellOpen] = useState(false);
    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [lastPayload, setLastPayload] = useState<RequestPayload | null>(null);
    const [quoteInitialScenario, setQuoteInitialScenario] = useState<QuoteScenarioId>(1);
    const [breakdownQuoteName, setBreakdownQuoteName] = useState<string | null>(null);
    const [buildQuoteModalOpen, setBuildQuoteModalOpen] = useState(false);
    const [quoteBuildName, setQuoteBuildName] = useState("");
    const [quoteBuildScenario, setQuoteBuildScenario] = useState<QuoteScenarioId>(1);
    const [quoteBuildQuantity, setQuoteBuildQuantity] = useState<number | "">("");
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);
    const [projectQuotes, setProjectQuotes] = useState<PersistedQuoteListItem[]>([]);
    const [projectQuotesLoading, setProjectQuotesLoading] = useState(false);
    const [projectQuotesError, setProjectQuotesError] = useState<string | null>(null);
    const [quoteDeletingId, setQuoteDeletingId] = useState<string | null>(null);
    const [sidebarProjectSearch, setSidebarProjectSearch] = useState("");
    const [sidebarQuoteSearch, setSidebarQuoteSearch] = useState("");
    const [activePersistedQuoteId, setActivePersistedQuoteId] = useState<string | null>(null);
    const [continueBusy, setContinueBusy] = useState(false);

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

    const refreshProjectQuotes = useCallback(async () => {
        const owner = typeof window !== "undefined" ? localStorage.getItem("username") : null;
        const pid = activeProjectId;
        if (!owner?.trim() || !pid) {
            setProjectQuotes([]);
            setProjectQuotesLoading(false);
            return;
        }
        setProjectQuotesLoading(true);
        setProjectQuotesError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(pid)}/quotes?owner=${encodeURIComponent(owner)}`,
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProjectQuotesError(typeof data.error === "string" ? data.error : "Could not load quotes");
                setProjectQuotes([]);
                return;
            }
            setProjectQuotes(Array.isArray(data.quotes) ? data.quotes : []);
        } catch {
            setProjectQuotesError("Could not load quotes");
            setProjectQuotes([]);
        } finally {
            setProjectQuotesLoading(false);
        }
    }, [activeProjectId]);

    const showQuotesWorkspace = quoteFlowShellOpen || (!!quoteData && !!lastPayload);

    useEffect(() => {
        if (showQuotesWorkspace && activeProjectId) {
            void refreshProjectQuotes();
        }
    }, [showQuotesWorkspace, activeProjectId, refreshProjectQuotes]);

    useEffect(() => {
        void refreshProjects();
    }, [refreshProjects, listVersion]);

    const filteredProjects = useMemo(() => {
        const q = sidebarProjectSearch;
        return projects.filter((p) =>
            sidebarSearchMatches(
                q,
                `${p.project_name || ""} ${p.num_standees} ${p.standee_type} ${p._id}`,
            ),
        );
    }, [projects, sidebarProjectSearch]);

    const filteredProjectQuotes = useMemo(() => {
        const q = sidebarQuoteSearch;
        return projectQuotes.filter((quote) => {
            const name = (quote.quote_name || "Untitled").trim();
            const scen =
                typeof quote.scenario === "number" ? `scenario ${quote.scenario} sc ${quote.scenario}` : "";
            const ns =
                typeof quote.num_standees === "number" ? `${quote.num_standees} standees` : "";
            return sidebarSearchMatches(q, `${name} ${scen} ${ns} ${quote._id}`);
        });
    }, [projectQuotes, sidebarQuoteSearch]);

    function handleClear() {
        setStandeeCount("");
        setStandeeType("Simple");
        setElements([]);
        setResetKey((k) => k + 1);
        setProjectName("Untitled project");
        setActiveProjectId(null);
        setQuoteFlowShellOpen(false);
        setQuoteData(null);
        setLastPayload(null);
        setBuildQuoteModalOpen(false);
        setIsQuoteLoading(false);
        setBreakdownQuoteName(null);
        setProjectQuotes([]);
        setProjectQuotesError(null);
        setQuoteDeletingId(null);
        setSidebarProjectSearch("");
        setSidebarQuoteSearch("");
        setActivePersistedQuoteId(null);
    }

    // TODO: Implement blue upload
    function handleBlueUpload() {
        console.log("Uploading anduuuuuuu...");
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
                rows.map((row: { length: number; width: number; complexity: string; linear_inches: number | null; description: string | null}, i: number) => ({
                    id: Date.now() + i,
                    height: row.length,
                    width: row.width,
                    complexity: row.complexity || "Simple",
                    description: row.description || "",
                    linear_inches:
                        row.linear_inches === null || row.linear_inches === undefined ? "" : row.linear_inches,
                })),
            );
            setResetKey((k) => k + 1);
            setQuoteFlowShellOpen(false);
            setQuoteData(null);
            setLastPayload(null);
            setBuildQuoteModalOpen(false);
            setBreakdownQuoteName(null);
            setProjectQuotes([]);
            setActivePersistedQuoteId(null);
        } catch {
            setProjectsError("Could not load project");
        } finally {
            setProjectsLoading(false);
        }
    }

    async function deletePersistedQuote(quoteId: string, quoteLabel: string) {
        if (!window.confirm(`Are you sure you want to delete "${quoteLabel}"? This action cannot be undone.`)) {
            return;
        }
        const owner = localStorage.getItem("username")?.trim();
        if (!owner) return;
        setProjectQuotesError(null);
        setQuoteDeletingId(quoteId);
        try {
            const res = await fetch(
                `${API_BASE}/quotes/${encodeURIComponent(quoteId)}?owner=${encodeURIComponent(owner)}`,
                { method: "DELETE" },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProjectQuotesError(persistApiFailureMessage(data) ?? "Could not delete quote");
                return;
            }
            if (activePersistedQuoteId === quoteId) {
                handleClearQuoteSelection();
            }
            await refreshProjectQuotes();
        } catch {
            setProjectQuotesError("Could not delete quote");
        } finally {
            setQuoteDeletingId(null);
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

    /** Create or update the current project on the server. Caller should bump listVersion on success. */
    async function persistCurrentProject(): Promise<{ success: boolean; errorMessage?: string }> {
        const owner = localStorage.getItem("username");
        if (!owner?.trim()) {
            return { success: false, errorMessage: "Not signed in" };
        }
        if (!canPersist) {
            return { success: false, errorMessage: "Add standees and at least one element" };
        }
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
                    return {
                        success: false,
                        errorMessage: persistApiFailureMessage(data) ?? "Could not update project",
                    };
                }
                return { success: true };
            }
            const body = {
                schema_version: 1,
                owner: owner.trim(),
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
                return {
                    success: false,
                    errorMessage: persistApiFailureMessage(data) ?? "Could not save project",
                };
            }
            if (typeof data.project_id !== "string") {
                return { success: false, errorMessage: "Could not save project" };
            }
            setActiveProjectId(data.project_id);
            return { success: true };
        } catch (e) {
            console.error("Save failed:", e);
            return { success: false, errorMessage: "Save failed" };
        }
    }

    async function handleContinue() {
        if (!canCalculate || continueBusy) return;
        const owner = typeof window !== "undefined" ? localStorage.getItem("username")?.trim() : null;
        if (owner && !activeProjectId) {
            setProjectsError(null);
            setContinueBusy(true);
            try {
                const r = await persistCurrentProject();
                if (!r.success) {
                    setProjectsError(r.errorMessage ?? "Could not save project");
                    return;
                }
                setListVersion((v) => v + 1);
            } finally {
                setContinueBusy(false);
            }
        }
        setQuoteFlowShellOpen(true);
    }

    function buildCoreQuotePayload(numStandees: number, scenarioId: QuoteScenarioId): RequestPayload {
        const standeeTypeMap: Record<StandeeType, number> = { Simple: 1, Moderate: 2, Complex: 3 };
        return {
            standee_type: standeeTypeMap[standeeType],
            elements: elements.map(({ height, width, complexity, linear_inches, description}) => ({
                name: "",
                height: height === "" ? 0 : height,
                width: width === "" ? 0 : width,
                complexity,
                linear_inches: linear_inches === "" ? null : linear_inches,
                description: description || "",
            })),
            num_standees: numStandees,
            scenario: scenarioId,
        };
    }

    const canSubmitBuildQuote =
        elements.length > 0 &&
        quoteBuildName.trim().length > 0 &&
        quoteBuildQuantity !== "" &&
        quoteBuildQuantity > 0;

    function handleExitQuotesWorkspace() {
        setQuoteFlowShellOpen(false);
        setQuoteData(null);
        setLastPayload(null);
        setBreakdownQuoteName(null);
        setActivePersistedQuoteId(null);
        setBuildQuoteModalOpen(false);
        setSidebarQuoteSearch("");
    }

    function handleClearQuoteSelection() {
        setQuoteData(null);
        setLastPayload(null);
        setBreakdownQuoteName(null);
        setActivePersistedQuoteId(null);
        setQuoteFlowShellOpen(true);
    }

    async function openPersistedQuote(quoteId: string) {
        if (activePersistedQuoteId === quoteId && quoteData) return;
        const owner = localStorage.getItem("username");
        if (!owner?.trim()) {
            console.error("Sign in to load saved quotes");
            return;
        }
        const res = await fetch(`${API_BASE}/quotes/${encodeURIComponent(quoteId)}?owner=${encodeURIComponent(owner)}`);
        const doc = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error("Load quote:", doc);
            return;
        }
        const qd = quoteDataFromPersistedBreakdown(doc.breakdown);
        if (Object.keys(qd).length === 0) {
            console.error("Quote has no scenario breakdown");
            return;
        }
        const initialScenario =
            typeof doc.scenario === "number" && doc.scenario >= 1 && doc.scenario <= 5
                ? (doc.scenario as QuoteScenarioId)
                : 1;
        setQuoteInitialScenario(initialScenario);
        setBreakdownQuoteName(typeof doc.quote_name === "string" ? doc.quote_name : "Quote");
        setActivePersistedQuoteId(quoteId);
        setQuoteData(qd);
        setLastPayload(
            requestPayloadFromQuoteDoc(doc, {
                elements,
                standeeType,
                standeeCount: standeeCount,
            }),
        );
        setQuoteFlowShellOpen(false);
    }

    function runBuildQuoteFromModal() {
        if (!canSubmitBuildQuote) return;
        const corePayload = buildCoreQuotePayload(quoteBuildQuantity as number, quoteBuildScenario);
        const payload: Record<string, unknown> = {
            ...corePayload,
            persist_project: false,
        };

        setBuildQuoteModalOpen(false);
        setIsQuoteLoading(true);
        const owner = typeof window !== "undefined" ? localStorage.getItem("username") : null;
        const pid = activeProjectId;
        const buildName = quoteBuildName.trim() || "Untitled quote";

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
                const row = data as Record<string, unknown>;
                setLastPayload(corePayload);
                setQuoteInitialScenario(quoteBuildScenario);
                setBreakdownQuoteName(buildName);
                setQuoteData(quoteDataFromGenerateResponse(row));
                setQuoteFlowShellOpen(false);
                setActivePersistedQuoteId(null);

                if (owner?.trim() && pid) {
                    const breakdownPayload: Record<string, unknown> = {};
                    for (const key of Object.keys(row)) {
                        if (key.startsWith("scenario_")) breakdownPayload[key] = row[key];
                    }
                    const cre = await fetch(`${API_BASE}/projects/${encodeURIComponent(pid)}/quotes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            owner: owner.trim(),
                            quote_name: buildName,
                            scenario: quoteBuildScenario,
                            num_standees: quoteBuildQuantity as number,
                            standee_type: standeeType,
                            elements: buildElementsForApi(elements),
                            breakdown: breakdownPayload,
                        }),
                    });
                    const cr = await cre.json().catch(() => ({}));
                    if (cre.ok && typeof cr.quote_id === "string") {
                        setActivePersistedQuoteId(cr.quote_id);
                    } else {
                        console.error("Could not persist quote:", cr);
                    }
                    void refreshProjectQuotes();
                }
            })
            .catch((error) => console.error("Error generating quote:", error))
            .finally(() => setIsQuoteLoading(false));
    }

    async function handleSave() {
        if (!canPersist) return;
        if (!localStorage.getItem("username")?.trim()) return;
        const r = await persistCurrentProject();
        if (r.success) setListVersion((v) => v + 1);
        else if (r.errorMessage) console.error(r.errorMessage);
    }

    const loggedIn =
        typeof window !== "undefined" && Boolean(localStorage.getItem("username")?.trim());

    if (isQuoteLoading) {
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

    if (showQuotesWorkspace) {
        return (
            <>
                <div className="flex flex-row w-full flex-1 min-h-0 overflow-hidden bg-[#F8F8F8]">
                    <aside className="shrink-0 w-[220px] flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3 min-h-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#000005]">
                            <span className="text-[#FFC843]">// </span>QUOTES
                        </div>
                        <div className="text-[11px] font-black text-[#000005] uppercase tracking-tight line-clamp-3 break-words px-0.5">
                            {projectName.trim() || "Untitled project"}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setQuoteBuildName(projectName.trim() || "Untitled quote");
                                setQuoteBuildScenario(1);
                                setQuoteBuildQuantity(standeeCount !== "" && standeeCount > 0 ? standeeCount : "");
                                setBuildQuoteModalOpen(true);
                            }}
                            className="text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200"
                        >
                            + BUILD NEW QUOTE
                        </button>
                        <div className="flex flex-col gap-1 shrink-0">
                            <label htmlFor="sidebar-quote-search" className="sr-only">
                                Search quotes
                            </label>
                            <input
                                id="sidebar-quote-search"
                                type="search"
                                value={sidebarQuoteSearch}
                                onChange={(e) => setSidebarQuoteSearch(e.target.value)}
                                placeholder="Search quotes…"
                                className={SIDEBAR_SEARCH_INPUT_CLASS}
                                autoComplete="off"
                            />
                        </div>
                        {!loggedIn && (
                            <p className="text-[10px] text-[#B1B3B6] font-semibold leading-snug px-0.5">
                                Sign in to load saved quotes for this project.
                            </p>
                        )}
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6] px-0.5">
                            Saved on this project
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 -mx-0.5 px-0.5">
                            {projectQuotesLoading && (
                                <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">Loading…</div>
                            )}
                            {projectQuotesError && (
                                <div className="text-[10px] text-red-500 font-semibold px-1 leading-snug">
                                    {projectQuotesError}
                                </div>
                            )}
                            {!projectQuotesLoading &&
                                loggedIn &&
                                projectQuotes.length === 0 &&
                                !projectQuotesError && (
                                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">No quotes yet.</div>
                                )}
                            {!projectQuotesLoading &&
                                loggedIn &&
                                projectQuotes.length > 0 &&
                                filteredProjectQuotes.length === 0 &&
                                sidebarQuoteSearch.trim() &&
                                !projectQuotesError && (
                                    <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">
                                        No quotes match your search.
                                    </div>
                                )}
                            {filteredProjectQuotes.map((q) => {
                                const label = (q.quote_name || "Untitled").trim();
                                return (
                                    <div
                                        key={q._id}
                                        className={`flex items-stretch gap-1 rounded-sm border-2 transition-all duration-200 ${
                                            activePersistedQuoteId === q._id
                                                ? "border-[#FFC843] bg-[#FFFBF0]"
                                                : "border-[#E0E0E0] bg-[#F8F8F8] hover:border-[#B1B3B6]"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => void openPersistedQuote(q._id)}
                                            disabled={quoteDeletingId !== null}
                                            className="min-w-0 flex-1 text-left px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#FFC843] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="text-[11px] font-black text-[#000005] uppercase tracking-tight line-clamp-3 break-words">
                                                {label}
                                            </div>
                                            <div className="text-[9px] text-[#B1B3B6] font-bold mt-0.5 uppercase tracking-wider">
                                                {typeof q.scenario === "number" ? `Sc. ${q.scenario}` : ""}
                                                {typeof q.num_standees === "number"
                                                    ? ` · ${q.num_standees} standees`
                                                    : ""}
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Delete quote ${label}`}
                                            disabled={quoteDeletingId !== null}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void deletePersistedQuote(q._id, label);
                                            }}
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
                            onClick={handleExitQuotesWorkspace}
                            className="shrink-0 w-full text-xs font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-2 rounded-sm cursor-pointer hover:bg-[#000005] hover:text-white hover:border-[#000005] transition-all duration-200 uppercase tracking-widest"
                        >
                            ← TO ESTIMATOR
                        </button>
                    </aside>
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                        {quoteData && lastPayload ? (
                            <QuoteBreakdown
                                key={activePersistedQuoteId ?? "draft"}
                                quoteData={quoteData}
                                numStandees={lastPayload.num_standees}
                                requestPayload={lastPayload}
                                initialActiveScenario={quoteInitialScenario}
                                quoteName={breakdownQuoteName}
                                persistedQuoteId={activePersistedQuoteId}
                                quoteOwner={
                                    typeof window !== "undefined" ? localStorage.getItem("username") : null
                                }
                                onBack={handleClearQuoteSelection}
                            />
                        ) : (
                            <div className="flex-1 min-h-0 bg-[#F8F8F8]" aria-hidden />
                        )}
                    </div>
                </div>
                <BuildQuoteModal
                    open={buildQuoteModalOpen}
                    onClose={() => setBuildQuoteModalOpen(false)}
                    quoteName={quoteBuildName}
                    onQuoteNameChange={setQuoteBuildName}
                    scenario={quoteBuildScenario}
                    onScenarioChange={setQuoteBuildScenario}
                    quantity={quoteBuildQuantity}
                    onQuantityChange={setQuoteBuildQuantity}
                    canSubmit={canSubmitBuildQuote}
                    onSubmit={runBuildQuoteFromModal}
                />
            </>
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
                <div className="flex flex-col gap-1 shrink-0">
                    <label htmlFor="sidebar-project-search" className="sr-only">
                        Search projects
                    </label>
                    <input
                        id="sidebar-project-search"
                        type="search"
                        value={sidebarProjectSearch}
                        onChange={(e) => setSidebarProjectSearch(e.target.value)}
                        placeholder="Search projects…"
                        className={SIDEBAR_SEARCH_INPUT_CLASS}
                        autoComplete="off"
                    />
                </div>
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
                    {!projectsLoading &&
                        projects.length > 0 &&
                        filteredProjects.length === 0 &&
                        sidebarProjectSearch.trim() &&
                        !projectsError && (
                            <div className="text-[11px] text-[#B1B3B6] font-semibold px-1">
                                No projects match your search.
                            </div>
                        )}
                    {filteredProjects.map((p) => (
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
            <div className="flex flex-col items-center flex-1 min-w-0 min-h-0 overflow-hidden px-8 py-6">
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
                        <div className="flex flex-row gap-4 w-full">
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">
                                    Project name
                                </div>
                                <input
                                    type="text"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    placeholder="Untitled project"
                                    className="border-2 border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-full bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">
                                    Standee Type
                                </div>
                                <Dropdown
                                    key={resetKey}
                                    options={["Simple", "Moderate", "Complex"]}
                                    currOption={standeeType}
                                    onSelect={(val: StandeeType) => setStandeeType(val)}
                                    width="w-full"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
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
                                    className="border-2 border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-full bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                                />
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
                            onClick={canCalculate && !continueBusy ? () => void handleContinue() : undefined}
                            className={`group flex flex-row justify-center gap-4 text-xs font-black py-3 rounded-sm flex-[2] min-w-[180px] transition-all duration-200 ease-in-out uppercase tracking-widest ${
                                canCalculate && !continueBusy
                                    ? "bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white cursor-pointer"
                                    : "bg-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                            }`}
                        >
                            {continueBusy ? "SAVING…" : "CONTINUE"}{" "}
                            <img
                                src="/submitarrow.svg"
                                alt=""
                                className={`transition-all duration-300 ease-in-out ${
                                    canCalculate && !continueBusy
                                        ? "group-hover:translate-x-1 group-hover:invert"
                                        : "opacity-40"
                                }`}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
