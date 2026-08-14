"use client";
import ElementsManager from "@/components/ElementsManager";
import Dropdown from "@/components/Dropdown";
import QuoteBreakdown from "@/components/QuoteBreakdown";
import UploadBlueModal from "@/components/UploadBlueModal";
import HistoryModal from "@/components/HistoryModal";
import ProjectSidebar, { type ProjectSummary } from "@/components/inputter/ProjectSidebar";
// import BuildQuoteModal from "@/components/BuildQuoteModal";
// import QuotesSidebar, { type SavedQuoteListItem } from "@/components/inputter/QuotesSidebar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/config";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────

type StandeeType = "Simple" | "Moderate" | "Complex";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
    description: string | "";
    maskImage?: string;
    originalHeight?: number;
    originalWidth?: number;
};

// Subtotal overrides and manual cost-row edits stored in the database alongside the quote breakdown
export type CostLineOverride = { qty: number; unitCost: number };

export type ScenarioCostLineOverrides = {
    universal?: Record<string, CostLineOverride>;
    scenario?: Record<string, CostLineOverride>;
};

export type QuoteBreakdownUi = {
    universal_subtotal_override?: Record<string, string>;
    scenario_subtotal_override?: Record<string, string>;
    /** Per scenario id ("1"…"5"): saved qty and $/unit for manually edited cost rows. */
    cost_line_overrides?: Record<string, ScenarioCostLineOverrides>;
};

// Full quote object — scenario_1 … scenario_5 blobs + optional UI overrides
export type QuoteData = {
    [key: string]: Record<string, number> | QuoteBreakdownUi | undefined;
};

// ── Persisted quote shape (v2) — quote object with five scenario children ──

export type PersistedLineEdit = { qty: number; unit_cost: number };

/** A user-added, freely-titled cost line in the Universal Costs section (e.g. a one-off specialty item). */
export type PersistedCustomLine = { id: string; title: string; cost: number; quantity: number };

export type PersistedScenarioChild = {
    /** Raw engine-computed scenario blob — values before any manual edits. */
    defaults: Record<string, number>;
    /** Only the cost rows the user manually changed, keyed by cost key. */
    line_edits: Record<string, PersistedLineEdit>;
    /** Manual scenario-subtotal override ("" when unset). */
    subtotal_override: string;
};

export type PersistedSpecParams = {
    num_standees: number;
    print_forms_per_standee: number;
    structure_forms_per_standee: number;
    overs: number;
    /** Adds one extra print form (standee-type complexity) to account for double-sided printing. */
    include_print_sides: boolean;
};

export type PersistedQuoteState = {
    /** Five scenario children keyed "1" … "5". */
    scenarios: Record<string, PersistedScenarioChild>;
    /** Shared (cross-scenario) cost-line edits + subtotal override + user-added specialty items. */
    universal: {
        line_edits: Record<string, PersistedLineEdit>;
        subtotal_override: string;
        custom_lines: PersistedCustomLine[];
    };
    /** Spec fields: what the user set (current) vs what the engine computed (defaults). */
    params: { current: PersistedSpecParams; defaults: PersistedSpecParams };
};

export type PersistedQuantityVariants = Record<string, PersistedQuoteState>;

const DEFAULT_STANDEE_COUNTS = [10, 20, 100, 250, 500] as const;

// Body shape sent to POST /generate_quote
export type RequestPayload = {
    elements: { name: string; height: number; width: number; complexity: string; linear_inches: number | null; description: string | null }[];
    num_standees: number;
    standee_type: number;
    include_print_sides?: boolean;
    scenario?: number;
};


// Shape of an element as stored in the database (uses "length" not "height")
type ApiPersistedElement = {
    name?: string;
    length: number;
    width: number;
    linear_inches?: number | null;
    complexity: string;
    mask_b64?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

// Pulls scenario_* keys out of the raw /generate_quote response
function quoteDataFromGenerateResponse(data: Record<string, unknown>): QuoteData {
    const out: QuoteData = {};
    for (const key of Object.keys(data)) {
        if (key.startsWith("scenario_")) out[key] = data[key] as Record<string, number>;
    }
    return out;
}

// Keeps only finite numbers — drops _debug_explanations and other non-numeric fields
function numericFields(blob: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(blob)) {
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
}

// Builds a pristine persisted-quote state (five scenario children, no edits) from a
// /generate_quote response — the engine outputs become the stored "defaults".
function freshPersistedQuoteState(
    quoteResult: Record<string, unknown>,
    numStandees: number,
    includePrintSides: boolean,
): PersistedQuoteState {
    const scenarios: Record<string, PersistedScenarioChild> = {};
    let seed: Record<string, number> | null = null;
    for (const sid of [1, 2, 3, 4, 5]) {
        const blob = quoteResult[`scenario_${sid}`];
        if (!blob || typeof blob !== "object" || Array.isArray(blob)) continue;
        const defaults = numericFields(blob as Record<string, unknown>);
        scenarios[String(sid)] = { defaults, line_edits: {}, subtotal_override: "" };
        if (!seed) seed = defaults;
    }
    const specDefaults: PersistedSpecParams = {
        num_standees: numStandees,
        print_forms_per_standee: seed?.print_forms_per_standee ?? 1,
        structure_forms_per_standee: seed?.structure_forms_per_standee ?? 0,
        overs: seed?.overs ?? 0,
        include_print_sides: includePrintSides,
    };
    return {
        scenarios,
        universal: { line_edits: {}, subtotal_override: "", custom_lines: [] },
        params: { current: { ...specDefaults }, defaults: { ...specDefaults } },
    };
}

// Parses a saved quote document (v2 shape — five scenario children) into breakdown state.
// Returns null for legacy docs without usable scenario children (caller regenerates instead).
function persistedStateFromQuoteDoc(doc: Record<string, unknown>): PersistedQuoteState | null {
    const raw = doc.scenarios as Record<string, Partial<PersistedScenarioChild>> | undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const scenarios: Record<string, PersistedScenarioChild> = {};
    let seed: Record<string, number> | null = null;
    for (const [sid, child] of Object.entries(raw)) {
        const defaults = numericFields((child?.defaults ?? {}) as Record<string, unknown>);
        if (Object.keys(defaults).length === 0) continue;
        scenarios[sid] = {
            defaults,
            line_edits: child?.line_edits ?? {},
            subtotal_override: child?.subtotal_override ?? "",
        };
        if (!seed) seed = defaults;
    }
    if (!seed) return null;
    const universalRaw = doc.universal as Partial<PersistedQuoteState["universal"]> | undefined;
    const paramsRaw = doc.params as Partial<PersistedQuoteState["params"]> | undefined;
    const fallbackSpec: PersistedSpecParams = {
        num_standees: typeof doc.num_standees === "number" ? doc.num_standees : 1,
        print_forms_per_standee: seed.print_forms_per_standee ?? 1,
        structure_forms_per_standee: seed.structure_forms_per_standee ?? 0,
        overs: seed.overs ?? 0,
        include_print_sides: false,
    };
    const paramsCurrent = paramsRaw?.current ?? { ...fallbackSpec };
    const paramsDefaults = paramsRaw?.defaults ?? { ...fallbackSpec };
    return {
        scenarios,
        universal: {
            line_edits: universalRaw?.line_edits ?? {},
            subtotal_override: universalRaw?.subtotal_override ?? "",
            // Older saved quotes predate the quantity field — default to 1.
            custom_lines: (universalRaw?.custom_lines ?? []).map((l) => ({
                ...l,
                quantity: Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1,
            })),
        },
        params: {
            // Older saved quotes predate the include_print_sides field — default to false.
            current: { ...paramsCurrent, include_print_sides: Boolean(paramsCurrent.include_print_sides) },
            defaults: { ...paramsDefaults, include_print_sides: Boolean(paramsDefaults.include_print_sides) },
        },
    };
}

function quantityVariantsFromQuoteDoc(doc: Record<string, unknown>): PersistedQuantityVariants {
    const raw = doc.quantity_variants;
    const variants: PersistedQuantityVariants = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [quantity, value] of Object.entries(raw as Record<string, unknown>)) {
            if (!value || typeof value !== "object" || Array.isArray(value)) continue;
            const state = persistedStateFromQuoteDoc(value as Record<string, unknown>);
            if (state && Number.isInteger(Number(quantity)) && Number(quantity) > 0) {
                variants[String(Number(quantity))] = state;
            }
        }
    }
    if (Object.keys(variants).length === 0) {
        const legacy = persistedStateFromQuoteDoc(doc);
        const quantity = typeof doc.num_standees === "number" ? doc.num_standees : null;
        if (legacy && quantity && quantity > 0) variants[String(quantity)] = legacy;
    }
    return variants;
}

// The scenario children's defaults are the breakdown's scenario blobs
function quoteDataFromPersistedState(state: PersistedQuoteState): QuoteData {
    const out: QuoteData = {};
    for (const [sid, child] of Object.entries(state.scenarios)) {
        out[`scenario_${sid}`] = child.defaults;
    }
    return out;
}

// Rebuilds the /generate_quote payload from a saved quote doc (used by Recalculate)
function payloadFromQuoteDoc(doc: Record<string, unknown>, state: PersistedQuoteState): RequestPayload {
    const standeeTypeMap: Record<string, number> = { Simple: 1, Moderate: 2, Complex: 3 };
    const rows = Array.isArray(doc.elements) ? (doc.elements as ApiPersistedElement[]) : [];
    return {
        elements: rows.map((e) => ({
            name: e.name ?? "",
            height: e.length,
            width: e.width,
            complexity: e.complexity,
            linear_inches: e.linear_inches ?? null,
            description: "",
        })),
        num_standees: state.params.current.num_standees,
        standee_type: standeeTypeMap[String(doc.standee_type)] ?? 1,
        include_print_sides: state.params.current.include_print_sides,
    };
}


// // Extracts scenario_* blobs + _breakdown_ui from a persisted quote document
// function quoteDataFromPersistedDoc(breakdown: unknown): QuoteData {
//     const out: QuoteData = {};
//     if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return out;
//     const b = breakdown as Record<string, unknown>;
//     for (const [key, val] of Object.entries(b)) {
//         if (!key.startsWith("scenario_")) continue;
//         if (val && typeof val === "object" && !Array.isArray(val)) {
//             out[key] = val as Record<string, number>;
//         }
//     }
//     const ui = b._breakdown_ui;
//     if (ui && typeof ui === "object" && !Array.isArray(ui)) {
//         out._breakdown_ui = ui as QuoteBreakdownUi;
//     }
//     return out;
// }

// // Reconstructs a RequestPayload from a persisted quote doc, falling back to current form state
// function buildPayloadFromPersistedQuote(
//     doc: { scenario?: number; num_standees?: number; standee_type?: string; elements?: ApiPersistedElement[] },
//     fallback: { elements: Element[]; standeeType: StandeeType; standeeCount: number | "" },
// ): RequestPayload {
//     const standeeTypeMap: Record<StandeeType, number> = { Simple: 1, Moderate: 2, Complex: 3 };
//     const srcRows =
//         Array.isArray(doc.elements) && doc.elements.length > 0
//             ? doc.elements
//             : fallback.elements.map((el) => ({
//                   name: "",
//                   length: el.height === "" ? 0 : el.height,
//                   width: el.width === "" ? 0 : el.width,
//                   linear_inches: el.linear_inches === "" ? null : el.linear_inches,
//                   complexity: el.complexity,
//               }));
//     const num =
//         typeof doc.num_standees === "number" && doc.num_standees >= 1
//             ? doc.num_standees
//             : fallback.standeeCount === "" || fallback.standeeCount < 1
//               ? 1
//               : fallback.standeeCount;
//     const st = (doc.standee_type as StandeeType) || fallback.standeeType;
//     return {
//         elements: srcRows.map((e) => ({
//             name: e.name ?? "",
//             height: e.length,
//             width: e.width,
//             complexity: e.complexity as StandeeType,
//             linear_inches: e.linear_inches ?? null,
//             description: "",
//         })),
//         num_standees: num,
//         standee_type: standeeTypeMap[st] ?? 1,
//         scenario: undefined,
//     };
// }

// Converts the UI element list to the shape expected by the backend
function elementsForApi(elements: Element[]) {
    return elements.map((el) => ({
        name: "",
        length: el.height === "" ? 0 : el.height,
        width: el.width === "" ? 0 : el.width,
        linear_inches: el.linear_inches === "" ? null : el.linear_inches,
        complexity: el.complexity as StandeeType,
        description: el.description || "",
        mask_b64: el.maskImage ?? null,
    }));
}

// Returns true if every word in `query` appears somewhere in `text`
function searchMatches(query: string, text: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const blob = text.toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((term) => blob.includes(term));
}

/** Searchable text for a project row in the sidebar. */
function projectSearchBlob(p: ProjectSummary): string {
    return `${p.project_name || ""} ${(p.standee_counts ?? [p.num_standees]).join(" ")} ${p.standee_type} ${p._id} ${p.short_id ?? ""} #${p.short_id ?? ""} ${p.owner ?? ""}`;
}

type QuoteSearchSummary = {
    _id: string;
    project_id: string;
    owner?: string;
    quote_name?: string;
    scenario?: number;
    num_standees?: number;
    /** Cost-table fingerprint when engine defaults were last refreshed. */
    cost_tables_version?: string;
};

/** Searchable text for a quote linked to a project. */
function quoteSearchBlob(q: QuoteSearchSummary): string {
    const scen = typeof q.scenario === "number" ? `scenario ${q.scenario}` : "";
    const ns = typeof q.num_standees === "number" ? `${q.num_standees} standees` : "";
    return `${q.quote_name || ""} ${scen} ${ns} ${q._id} ${q.owner ?? ""} ${q.project_id}`;
}

// Extracts a user-readable error message from a failed API response body
function apiErrorMessage(data: unknown): string | null {
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

// ── Component ──────────────────────────────────────────────────────────────

export default function Inputter() {
    // ── Estimator form state ───────────────────────────────────────────────
    const [standeeCounts, setStandeeCounts] = useState<Array<number | "">>([...DEFAULT_STANDEE_COUNTS]);
    const [standeeType, setStandeeType]     = useState<StandeeType>("Simple");
    const [includePrintSides, setIncludePrintSides] = useState(false);
    // Last persisted value — a toggle that lands back on this doesn't dirty the project.
    const [savedIncludePrintSides, setSavedIncludePrintSides] = useState(false);
    const [elements, setElements]           = useState<Element[]>([]);
    const [elementListKey, setElementListKey] = useState(0); // bumped to force ElementsManager reset
    const [projectName, setProjectName]     = useState("Untitled project");

    // ── Saved project state ────────────────────────────────────────────────
    const [activeProjectId, setActiveProjectId]     = useState<string | null>(null);
    const [activeProjectShortId, setActiveProjectShortId] = useState<string | null>(null);
    const [activeProjectOwner, setActiveProjectOwner] = useState<string | null>(null);
    const [projectList, setProjectList]             = useState<ProjectSummary[]>([]);
    const [quoteList, setQuoteList]                 = useState<QuoteSearchSummary[]>([]);
    const [costTablesVersion, setCostTablesVersion] = useState("");
    const [projectListLoading, setProjectListLoading] = useState(false);
    const [projectListError, setProjectListError]   = useState<string | null>(null);
    const [projectListRefreshKey, setProjectListRefreshKey] = useState(0); // bumped to re-fetch list

    // ── Quote workspace state ──────────────────────────────────────────────
    const [activeQuoteData, setActiveQuoteData]               = useState<QuoteData | null>(null);
    const [activeQuotePayload, setActiveQuotePayload]         = useState<RequestPayload | null>(null);
    const [activeQuoteName, setActiveQuoteName]               = useState<string | null>(null);
    const [activeQuoteContributionMargin, setActiveQuoteContributionMargin] = useState<number | null>(null);
    const [activePersistedQuoteId, setActivePersistedQuoteId] = useState<string | null>(null);
    const [activePersistedQuoteState, setActivePersistedQuoteState] = useState<PersistedQuoteState | null>(null);
    const [activeQuantityVariants, setActiveQuantityVariants] = useState<PersistedQuantityVariants>({});
    const [activeQuoteQuantity, setActiveQuoteQuantity] = useState<number | null>(null);
    const [isQuoteGenerating, setIsQuoteGenerating]           = useState(false);

    // ── Saved quotes list (inside workspace) — commented, restore with QuotesSidebar ──
    // const [savedQuoteList, setSavedQuoteList]           = useState<SavedQuoteListItem[]>([]);
    // const [savedQuoteListLoading, setSavedQuoteListLoading] = useState(false);
    // const [savedQuoteListError, setSavedQuoteListError] = useState<string | null>(null);
    // const [deletingQuoteId, setDeletingQuoteId]         = useState<string | null>(null);

    // ── UI state ───────────────────────────────────────────────────────────
    const [projectSearchQuery, setProjectSearchQuery]   = useState("");
    // const [quoteSearchQuery, setQuoteSearchQuery]     = useState("");
    const [uploadBlueOpen, setUploadBlueOpen]           = useState(false);
    const [historyModalOpen, setHistoryModalOpen]       = useState(false);
    const [isSavingBeforeContinue, setIsSavingBeforeContinue] = useState(false);
    const [isDirty, setIsDirty]                         = useState(false);
    const [needsRecalc, setNeedsRecalc]                 = useState(false);
    const [toast, setToast]                             = useState<{ message: string; type: "save" | "delete" } | null>(null);
    const [toastVisible, setToastVisible]               = useState(false);
    const { username: authUsername, isAdmin } = useAuth();
    const currentUser = authUsername;

    // Slides the toast in from the top, then fades it out after 2.5 s
    useEffect(() => {
        if (toast) {
            const showId   = setTimeout(() => setToastVisible(true), 20);
            const hideId   = setTimeout(() => setToastVisible(false), 2500);
            const removeId = setTimeout(() => setToast(null), 2800);
            return () => { clearTimeout(showId); clearTimeout(hideId); clearTimeout(removeId); };
        }
    }, [toast]);

    function showToast(message: string, type: "save" | "delete") {
        setToastVisible(false);
        setToast(null);
        setTimeout(() => setToast({ message, type }), 10);
    }

    // ── Data fetching ──────────────────────────────────────────────────────

    // GET /projects + GET /quotes + cost-tables version → sidebar search + stale cost highlighting
    const refreshProjectList = useCallback(async () => {
        setProjectListLoading(true);
        setProjectListError(null);
        try {
            const [projectsRes, quotesRes, versionRes] = await Promise.all([
                fetch(`${API_BASE}/projects`),
                fetch(`${API_BASE}/quotes`),
                fetch(`${API_BASE}/cost-tables-version`),
            ]);
            const projectsData = await projectsRes.json().catch(() => ({}));
            const quotesData = await quotesRes.json().catch(() => ({}));
            const versionData = await versionRes.json().catch(() => ({}));
            if (!projectsRes.ok) {
                setProjectListError(typeof projectsData.error === "string" ? projectsData.error : "Could not load projects");
                setProjectList([]);
                setQuoteList([]);
                return;
            }
            setProjectList(Array.isArray(projectsData.projects) ? projectsData.projects : []);
            setQuoteList(quotesRes.ok && Array.isArray(quotesData.quotes) ? quotesData.quotes : []);
            const version =
                versionRes.ok && typeof versionData.version === "string" ? versionData.version : "";
            setCostTablesVersion(version);
        } catch {
            setProjectListError("Could not load projects");
            setProjectList([]);
            setQuoteList([]);
        } finally {
            setProjectListLoading(false);
        }
    }, []);


    useEffect(() => { void refreshProjectList(); }, [refreshProjectList, projectListRefreshKey]);

    // Re-check cost-table version when returning from Data Collector (or another tab).
    useEffect(() => {
        function refreshIfVisible() {
            if (document.visibilityState === "visible") {
                setProjectListRefreshKey((v) => v + 1);
            }
        }
        document.addEventListener("visibilitychange", refreshIfVisible);
        return () => document.removeEventListener("visibilitychange", refreshIfVisible);
    }, []);

    // // GET /projects/:id/quotes?owner=... → refresh the quotes list inside the workspace
    // const refreshSavedQuoteList = useCallback(async () => {
    //     const owner = typeof window !== "undefined" ? localStorage.getItem("username") : null;
    //     if (!owner?.trim() || !activeProjectId) {
    //         setSavedQuoteList([]);
    //         setSavedQuoteListLoading(false);
    //         return;
    //     }
    //     setSavedQuoteListLoading(true);
    //     setSavedQuoteListError(null);
    //     try {
    //         const res = await fetch(
    //             `${API_BASE}/projects/${encodeURIComponent(activeProjectId)}/quotes?owner=${encodeURIComponent(owner)}`,
    //         );
    //         const data = await res.json().catch(() => ({}));
    //         if (!res.ok) {
    //             setSavedQuoteListError(typeof data.error === "string" ? data.error : "Could not load quotes");
    //             setSavedQuoteList([]);
    //             return;
    //         }
    //         setSavedQuoteList(Array.isArray(data.quotes) ? data.quotes : []);
    //     } catch {
    //         setSavedQuoteListError("Could not load quotes");
    //         setSavedQuoteList([]);
    //     } finally {
    //         setSavedQuoteListLoading(false);
    //     }
    // }, [activeProjectId]);

    // ── Filtered sidebar lists ─────────────────────────────────────────────

    const quotesByProjectId = useMemo(() => {
        const map = new Map<string, QuoteSearchSummary[]>();
        for (const q of quoteList) {
            const pid = q.project_id;
            if (!pid) continue;
            const bucket = map.get(pid) ?? [];
            bucket.push(q);
            map.set(pid, bucket);
        }
        return map;
    }, [quoteList]);

    function isQuoteCostsStale(latest: QuoteSearchSummary | undefined): boolean {
        if (!latest || !costTablesVersion) return false;
        const stamped =
            typeof latest.cost_tables_version === "string" ? latest.cost_tables_version : null;
        // Missing/legacy stamp ⇒ not marked stale here (server backfills on connect).
        if (!stamped) return false;
        return stamped !== costTablesVersion;
    }

    const filteredProjects = useMemo(() => {
        const matched = projectList.filter((p) => {
            if (searchMatches(projectSearchQuery, projectSearchBlob(p))) return true;
            const quotes = quotesByProjectId.get(p._id) ?? [];
            return quotes.some((q) => searchMatches(projectSearchQuery, quoteSearchBlob(q)));
        });
        return matched.map((p) => {
            const quotes = quotesByProjectId.get(p._id) ?? [];
            // Newest quote first (GET /quotes sorts by _id desc).
            return { ...p, costsStale: isQuoteCostsStale(quotes[0]) };
        });
    }, [projectList, projectSearchQuery, quotesByProjectId, costTablesVersion]);

    const activeProjectCostsStale = useMemo(() => {
        if (!activeProjectId) return false;
        const quotes = quotesByProjectId.get(activeProjectId) ?? [];
        return isQuoteCostsStale(quotes[0]);
    }, [activeProjectId, quotesByProjectId, costTablesVersion]);

    // Owner of a project in the sidebar list (needed for owner-scoped API calls on
    // projects that belong to other users).
    function ownerForProject(projectId: string): string | null {
        const fromList = projectList.find((p) => p._id === projectId)?.owner;
        if (fromList) return fromList;
        if (activeProjectId === projectId && activeProjectOwner) return activeProjectOwner;
        return authUsername;
    }

    // ── Project actions ────────────────────────────────────────────────────

    function resetEstimatorForm() {
        setStandeeCounts([...DEFAULT_STANDEE_COUNTS]);
        setStandeeType("Simple");
        setIncludePrintSides(false);
        setSavedIncludePrintSides(false);
        setElements([]);
        setElementListKey((k) => k + 1);
        setProjectName("Untitled project");
        setActiveProjectId(null);
        setIsDirty(false);
        setNeedsRecalc(false);
        setActiveProjectShortId(null);
        setActiveProjectOwner(null);
        setActiveQuoteData(null);
        setActiveQuotePayload(null);
        setIsQuoteGenerating(false);
        setActiveQuoteName(null);
        // setSavedQuoteList([]);
        // setSavedQuoteListError(null);
        // setDeletingQuoteId(null);
        setProjectSearchQuery("");
        // setQuoteSearchQuery("");
        setActivePersistedQuoteId(null);
        setActivePersistedQuoteState(null);
        setActiveQuantityVariants({});
        setActiveQuoteQuantity(null);
    }

    // POST /create-project  or  PATCH /projects/:id  → save current form to the database
    async function saveCurrentProject(): Promise<{ success: boolean; projectId?: string; shortId?: string; errorMessage?: string }> {
        const owner = authUsername;
        if (!owner?.trim()) return { success: false, errorMessage: "Not signed in" };
        if (!canCalculate) {
            return { success: false, errorMessage: "Enter 1–5 unique positive quantities and add at least one element" };
        }
        const counts = standeeCounts.filter((count): count is number => typeof count === "number" && count > 0);
        const num = counts[0]!;
        const apiElems   = elementsForApi(elements);
        try {
            if (activeProjectId) {
                // PATCH /projects/:id → update existing project (scoped to its own owner,
                // which can differ from the signed-in user)
                const docOwner = activeProjectOwner ?? owner;
                const res = await fetch(
                    `${API_BASE}/projects/${encodeURIComponent(activeProjectId)}?owner=${encodeURIComponent(docOwner)}&changed_by=${encodeURIComponent(owner)}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            project_name: projectName.trim() || "Untitled project",
                            num_standees: num,
                            standee_counts: counts,
                            standee_type: standeeType,
                            elements: apiElems,
                            include_print_sides: includePrintSides,
                        }),
                    },
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return { success: false, errorMessage: apiErrorMessage(data) ?? "Could not update project" };
                let shortId = activeProjectShortId ?? undefined;
                // Older sessions may not have the short id yet — pick it up from the doc
                // (the backend backfills short_id on read).
                if (!shortId) {
                    const docRes = await fetch(
                        `${API_BASE}/projects/${encodeURIComponent(activeProjectId)}?owner=${encodeURIComponent(docOwner)}`,
                    );
                    const doc = await docRes.json().catch(() => ({}));
                    if (docRes.ok && typeof doc.short_id === "string") {
                        shortId = doc.short_id;
                        setActiveProjectShortId(doc.short_id);
                    }
                }
                setSavedIncludePrintSides(includePrintSides);
                return { success: true, projectId: activeProjectId, shortId };
            }
            // POST /create-project → create a new project
            const res = await fetch(`${API_BASE}/create-project`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    schema_version: 2,
                    owner: owner.trim(),
                    project_name: projectName.trim() || "Untitled project",
                    num_standees: num,
                    standee_counts: counts,
                    standee_type: standeeType,
                    elements: apiElems,
                    include_print_sides: includePrintSides,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { success: false, errorMessage: apiErrorMessage(data) ?? "Could not save project" };
            if (typeof data.project_id !== "string") return { success: false, errorMessage: "Could not save project" };
            const shortId = typeof data.short_id === "string" ? data.short_id : undefined;
            setActiveProjectId(data.project_id);
            setActiveProjectShortId(shortId ?? null);
            setActiveProjectOwner(owner.trim());
            setSavedIncludePrintSides(includePrintSides);
            return { success: true, projectId: data.project_id, shortId };
        } catch (e) {
            console.error("Save failed:", e);
            return { success: false, errorMessage: "Save failed" };
        }
    }

    // GET /projects/:id → load a saved project into the estimator form
    async function loadProject(projectId: string) {
        const owner = ownerForProject(projectId);
        if (!owner) return;
        setProjectListLoading(true);
        setProjectListError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}?owner=${encodeURIComponent(owner)}`,
            );
            const doc = await res.json();
            if (!res.ok) {
                setProjectListError(typeof doc.error === "string" ? doc.error : "Could not load project");
                return;
            }
            setActiveProjectId(doc._id);
            setActiveProjectShortId(typeof doc.short_id === "string" ? doc.short_id : null);
            setActiveProjectOwner(typeof doc.owner === "string" ? doc.owner : owner);
            setProjectName(typeof doc.project_name === "string" ? doc.project_name : "Untitled project");
            setStandeeType((doc.standee_type as StandeeType) || "Simple");
setIncludePrintSides(Boolean(doc.include_print_sides));
setSavedIncludePrintSides(Boolean(doc.include_print_sides));
const savedCounts =
    Array.isArray(doc.standee_counts) && doc.standee_counts.length > 0
        ? doc.standee_counts.filter((count: unknown) => typeof count === "number" && count > 0).slice(0, 5)
        : typeof doc.num_standees === "number"
          ? [doc.num_standees]
          : [];
setStandeeCounts(Array.from({ length: 5 }, (_, index) => savedCounts[index] ?? ""));
            const rows = Array.isArray(doc.elements) ? doc.elements : [];
            setElements(
                rows.map((row: ApiPersistedElement & { description?: string | null }, i: number) => ({
                    id: Date.now() + i,
                    height: row.length,
                    width: row.width,
                    complexity: row.complexity || "Simple",
                    description: row.description || "",
                    linear_inches: row.linear_inches === null || row.linear_inches === undefined ? "" : row.linear_inches,
                    maskImage: row.mask_b64 ?? undefined,
                })),
            );
            setElementListKey((k) => k + 1);
            setActiveQuoteData(null);
            setActiveQuotePayload(null);
            setActiveQuoteName(null);
            // setSavedQuoteList([]);
            setActivePersistedQuoteId(null);
            setActivePersistedQuoteState(null);
            setActiveQuantityVariants({});
            setActiveQuoteQuantity(null);
            setIsDirty(false);
            setNeedsRecalc(false);
        } catch {
            setProjectListError("Could not load project");
        } finally {
            setProjectListLoading(false);
        }
    }

    // DELETE /projects/:id → remove a project and clear form if it was active
    async function deleteProject(projectId: string, projectLabel: string) {
        const owner = ownerForProject(projectId);
        if (!owner) return;
        const actingUser = authUsername?.trim() ?? null;
        if (!actingUser || (actingUser !== owner && !isAdmin)) {
            setProjectListError("Only the project owner or an admin can delete this project");
            return;
        }
        setProjectListError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}?owner=${encodeURIComponent(owner)}&requester=${encodeURIComponent(actingUser)}`,
                { method: "DELETE" },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProjectListError(typeof data.error === "string" ? data.error : "Could not delete project");
                return;
            }
            if (activeProjectId === projectId) resetEstimatorForm();
            setProjectListRefreshKey((v) => v + 1);
            showToast(`"${projectLabel}" deleted`, "delete");
        } catch {
            setProjectListError("Could not delete project");
        }
    }

    // ── Quote actions ──────────────────────────────────────────────────────

    const enteredStandeeCounts = standeeCounts.filter((count) => count !== "");
    const validStandeeCounts = enteredStandeeCounts.filter(
        (count): count is number => typeof count === "number" && Number.isInteger(count) && count > 0,
    );
    const hasValidStandeeCounts =
        validStandeeCounts.length >= 1 &&
        validStandeeCounts.length === enteredStandeeCounts.length &&
        new Set(validStandeeCounts).size === validStandeeCounts.length;
    const canCalculate = hasValidStandeeCounts && elements.length > 0;

    // Wrap setElements for ElementsManager so any user-driven element change marks the project dirty
    const dirtySetElements = useCallback(
        (value: React.SetStateAction<Element[]>) => {
            setElements(value);
            if (activeProjectId) setIsDirty(true);
        },
        [activeProjectId],
    );

    // Builds the base request body for POST /generate_quote (all 5 scenarios)
    function buildQuotePayload(numStandees: number): RequestPayload {
        const standeeTypeMap: Record<StandeeType, number> = { Simple: 1, Moderate: 2, Complex: 3 };
        return {
            standee_type: standeeTypeMap[standeeType],
            include_print_sides: includePrintSides,
            elements: elements.map(({ height, width, complexity, linear_inches, description }) => ({
                name: "",
                height: height === "" ? 0 : height,
                width: width === "" ? 0 : width,
                complexity,
                linear_inches: linear_inches === "" ? null : linear_inches,
                description: description || "",
            })),
            num_standees: numStandees,
        };
    }

    // GET /projects/:id/quotes → opens the newest saved quote (with its manual edits).
    // Returns false when the project has no usable saved quote yet.
    async function openLatestSavedQuote(projectId: string, owner: string): Promise<boolean> {
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}/quotes?owner=${encodeURIComponent(owner)}`,
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !Array.isArray(data.quotes) || data.quotes.length === 0) return false;
            const doc = data.quotes[0] as Record<string, unknown>; // list is newest-first
            const variants = quantityVariantsFromQuoteDoc(doc);
            const preferredQuantity = validStandeeCounts.find((quantity) => variants[String(quantity)]);
            const quantity = preferredQuantity ?? Number(Object.keys(variants)[0]);
            const state = variants[String(quantity)];
            if (!state || !Number.isFinite(quantity)) return false;
            setActiveQuotePayload(payloadFromQuoteDoc(doc, state));
            setActiveQuoteName(typeof doc.quote_name === "string" ? doc.quote_name : "Quote");
            setActiveQuoteContributionMargin(typeof doc.contribution_margin === "number" ? doc.contribution_margin : 0);
            setActiveQuoteData(quoteDataFromPersistedState(state));
            setActivePersistedQuoteId(typeof doc._id === "string" ? doc._id : null);
            setActivePersistedQuoteState(state);
            setActiveQuantityVariants(variants);
            setActiveQuoteQuantity(quantity);
            return true;
        } catch {
            return false;
        }
    }

    // "Continue" button — opens the saved quote if one exists; otherwise saves the
    // project, fires all 5 scenarios, and auto-saves a new quote.
    async function handleContinue() {
        if (!canCalculate || isSavingBeforeContinue) return;
        const shouldRegenerate = needsRecalc || isDirty;
        const owner = authUsername?.trim() ?? null;
        // Quotes are scoped to the project's owner, which can differ from the signed-in user.
        const projectOwner = activeProjectOwner ?? owner;
        let projectId = activeProjectId;

        // Ensure the project is saved so we have a project ID to attach the quote to
        if (owner) {
            setProjectListError(null);
            setIsSavingBeforeContinue(true);
            try {
                const r = await saveCurrentProject();
                if (!r.success) { setProjectListError(r.errorMessage ?? "Could not save project"); return; }
                if (r.projectId) projectId = r.projectId;
                setIsDirty(false);
                setProjectListRefreshKey((v) => v + 1);
            } finally {
                setIsSavingBeforeContinue(false);
            }
        }

        setIsQuoteGenerating(true);
        const quantities  = [...validStandeeCounts];
        const num         = quantities[0]!;
        const corePayload = buildQuotePayload(num);
        const quoteName   = projectName.trim() || "Untitled quote";
        const pid         = projectId;

        try {
            // A saved quote already exists → view it instead of regenerating, so manual
            // edits are preserved. Skip only when needsRecalc (specs changed since last save).
            // Outdated cost tables still open View Quote — user updates via the red button inside.
            if (!shouldRegenerate && projectOwner && pid && (await openLatestSavedQuote(pid, projectOwner))) {
                return;
            }

const generated = await Promise.all(
    quantities.map(async (quantity) => {
        const payload = buildQuotePayload(quantity);
        const res = await fetch(`${API_BASE}/generate_quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, persist_project: false }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(apiErrorMessage(data) ?? `Could not calculate quantity ${quantity}`);
        return { quantity, payload, result: data as Record<string, unknown> };
    }),
);
const quantityVariants: PersistedQuantityVariants = {};
for (const item of generated) {
    quantityVariants[String(item.quantity)] = freshPersistedQuoteState(item.result, item.quantity, includePrintSides);
}
const primary = generated[0]!;
const quoteResult = primary.result;
const quoteData = quoteDataFromGenerateResponse(quoteResult);
const persistedState = quantityVariants[String(num)]!;
            setActiveQuotePayload(corePayload);
            setActiveQuoteName(quoteName);
            setActiveQuoteContributionMargin(0);
            setActiveQuoteData(quoteData);
            setActivePersistedQuoteId(null);
            setActivePersistedQuoteState(persistedState);
            setActiveQuantityVariants(quantityVariants);
            setActiveQuoteQuantity(num);
            setNeedsRecalc(false);

            // Auto-save the quote to the project if signed in — quote object + five scenario
            // children. If a quote already exists for this project, update it IN PLACE (a
            // recalculate is a change to the same quote, not a brand-new one — creating a new
            // document here would start a fresh history timeline and wrongly log it as "Created").
            if (projectOwner && pid) {
                let existingQuoteId: string | null = null;
                try {
                    const listRes = await fetch(
                        `${API_BASE}/projects/${encodeURIComponent(pid)}/quotes?owner=${encodeURIComponent(projectOwner)}`,
                    );
                    const listData = await listRes.json().catch(() => ({}));
                    if (listRes.ok && Array.isArray(listData.quotes) && listData.quotes.length > 0) {
                        const newest = listData.quotes[0] as { _id?: unknown };
                        existingQuoteId = typeof newest._id === "string" ? newest._id : null;
                    }
                } catch {
                    existingQuoteId = null;
                }

                const quoteFields = {
                    quote_name: quoteName,
                    scenario: 1,
                    num_standees: num,
                    contribution_margin: 0,
                    standee_type: standeeType,
                    elements: elementsForApi(elements),
                    quantity_variants: quantityVariants,
                    scenarios: persistedState.scenarios,
                    universal: persistedState.universal,
                    params: persistedState.params,
                    ...(typeof quoteResult.cost_tables_version === "string"
                        ? { cost_tables_version: quoteResult.cost_tables_version }
                        : {}),
                };

                if (existingQuoteId) {
                    const patchRes = await fetch(
                        `${API_BASE}/quotes/${encodeURIComponent(existingQuoteId)}?owner=${encodeURIComponent(projectOwner)}&changed_by=${encodeURIComponent(owner ?? projectOwner)}`,
                        {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(quoteFields),
                        },
                    );
                    const patchData = await patchRes.json().catch(() => ({}));
                    if (patchRes.ok) {
                        setActivePersistedQuoteId(existingQuoteId);
                    } else {
                        console.error("Could not update quote:", apiErrorMessage(patchData) ?? patchData);
                    }
                } else {
                    const saveRes = await fetch(`${API_BASE}/projects/${encodeURIComponent(pid)}/quotes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ owner: projectOwner, changed_by: owner ?? projectOwner, ...quoteFields }),
                    });
                    const saveData = await saveRes.json().catch(() => ({}));
                    if (saveRes.ok && typeof saveData.quote_id === "string") {
                        setActivePersistedQuoteId(saveData.quote_id);
                    } else {
                        console.error("Could not persist quote:", apiErrorMessage(saveData) ?? saveData);
                    }
                }
                setProjectListRefreshKey((v) => v + 1);
                // void refreshSavedQuoteList();
            }
        } catch (err) {
            console.error("Error generating quote:", err);
        } finally {
            setIsQuoteGenerating(false);
        }
    }

    // "Save" button — saves without generating a quote
    async function handleSave() {
        if (!canCalculate) return;
        if (!authUsername?.trim()) return;
        const r = await saveCurrentProject();
        if (r.success) {
            if (isDirty) { setIsDirty(false); setNeedsRecalc(true); }
            setProjectListRefreshKey((v) => v + 1);
            showToast(r.shortId ? `Project saved — ID #${r.shortId}` : "Project saved", "save");
        } else if (r.errorMessage) console.error(r.errorMessage);
    }

    // PATCH /projects/:id/rename → rename a project
    async function renameProject(projectId: string, newName: string) {
        const owner = ownerForProject(projectId);
        if (!owner) return;
        const actingUser = authUsername?.trim() ?? null;
        if (!actingUser || (actingUser !== owner && !isAdmin)) {
            setProjectListError("Only the project owner or an admin can rename this project");
            return;
        }
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}/rename?owner=${encodeURIComponent(owner)}&changed_by=${encodeURIComponent(actingUser)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project_name: newName }),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setProjectListError(apiErrorMessage(data) ?? "Could not rename project"); return; }
            if (activeProjectId === projectId) setProjectName(newName);
            setProjectListRefreshKey((v) => v + 1);
            showToast(`Renamed to "${newName}"`, "save");
        } catch {
            setProjectListError("Could not rename project");
        }
    }

    // POST /projects/:id/duplicate → clone a project + its saved quotes under the
    // signed-in user, with a fresh (empty) history of its own.
    async function duplicateProject(projectId: string, projectLabel: string) {
        const sourceOwner = ownerForProject(projectId);
        const newOwner = authUsername?.trim() ?? null;
        if (!sourceOwner || !newOwner) return;
        setProjectListError(null);
        try {
            const res = await fetch(
                `${API_BASE}/projects/${encodeURIComponent(projectId)}/duplicate?owner=${encodeURIComponent(sourceOwner)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ new_owner: newOwner, project_name: `${projectLabel} (Copy)` }),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProjectListError(apiErrorMessage(data) ?? "Could not duplicate project");
                return;
            }
            setProjectListRefreshKey((v) => v + 1);
            showToast(`Duplicated as "${projectLabel} (Copy)"`, "save");
            if (typeof data.project_id === "string") void loadProject(data.project_id);
        } catch {
            setProjectListError("Could not duplicate project");
        }
    }

    // // GET /quotes/:id → load a saved quote into the breakdown view
    // async function openSavedQuote(quoteId: string) {
    //     if (activePersistedQuoteId === quoteId && activeQuoteData) return;
    //     const owner = localStorage.getItem("username");
    //     if (!owner?.trim()) { console.error("Sign in to load saved quotes"); return; }
    //     const res = await fetch(`${API_BASE}/quotes/${encodeURIComponent(quoteId)}?owner=${encodeURIComponent(owner)}`);
    //     const doc = await res.json().catch(() => ({}));
    //     if (!res.ok) { console.error("Load quote:", doc); return; }
    //     const qd = quoteDataFromPersistedDoc(doc.breakdown);
    //     if (Object.keys(qd).length === 0) { console.error("Quote has no scenario breakdown"); return; }
    //     setActiveQuoteName(typeof doc.quote_name === "string" ? doc.quote_name : "Quote");
    //     setActiveQuoteContributionMargin(typeof doc.contribution_margin === "number" ? doc.contribution_margin : 0);
    //     setActivePersistedQuoteId(quoteId);
    //     setActiveQuoteData(qd);
    //     setActiveQuotePayload(buildPayloadFromPersistedQuote(doc, { elements, standeeType, standeeCount }));
    // }

    // // PATCH /quotes/:id/rename → rename a quote
    // async function renameSavedQuote(quoteId: string, newName: string) {
    //     const owner = localStorage.getItem("username");
    //     if (!owner) return;
    //     try {
    //         const res = await fetch(
    //             `${API_BASE}/quotes/${encodeURIComponent(quoteId)}/rename?owner=${encodeURIComponent(owner)}`,
    //             { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote_name: newName }) },
    //         );
    //         const data = await res.json().catch(() => ({}));
    //         if (!res.ok) { setSavedQuoteListError(apiErrorMessage(data) ?? "Could not rename quote"); return; }
    //         if (activePersistedQuoteId === quoteId) setActiveQuoteName(newName);
    //         await refreshSavedQuoteList();
    //         showToast(`Renamed to "${newName}"`, "save");
    //     } catch {
    //         setSavedQuoteListError("Could not rename quote");
    //     }
    // }

    // // DELETE /quotes/:id → remove a saved quote from the project
    // async function deleteSavedQuote(quoteId: string, _quoteLabel: string) {
    //     const owner = localStorage.getItem("username")?.trim();
    //     if (!owner) return;
    //     setSavedQuoteListError(null);
    //     setDeletingQuoteId(quoteId);
    //     try {
    //         const res = await fetch(
    //             `${API_BASE}/quotes/${encodeURIComponent(quoteId)}?owner=${encodeURIComponent(owner)}`,
    //             { method: "DELETE" },
    //         );
    //         const data = await res.json().catch(() => ({}));
    //         if (!res.ok) { setSavedQuoteListError(apiErrorMessage(data) ?? "Could not delete quote"); return; }
    //         if (activePersistedQuoteId === quoteId) clearActiveQuote();
    //         await refreshSavedQuoteList();
    //     } catch {
    //         setSavedQuoteListError("Could not delete quote");
    //     } finally {
    //         setDeletingQuoteId(null);
    //     }
    // }

    // // Exits the quotes workspace entirely (clears quote + search state)
    // function exitQuotesWorkspace() {
    //     setActiveQuoteData(null);
    //     setActiveQuotePayload(null);
    //     setActiveQuoteName(null);
    //     setActivePersistedQuoteId(null);
    //     setQuoteSearchQuery("");
    // }

    function clearActiveQuote() {
        setActiveQuoteData(null);
        setActiveQuotePayload(null);
        setActiveQuoteName(null);
        setActivePersistedQuoteId(null);
        setActivePersistedQuoteState(null);
        setActiveQuantityVariants({});
        setActiveQuoteQuantity(null);
    }

    function selectActiveQuoteQuantity(quantity: number) {
        const state = activeQuantityVariants[String(quantity)];
        if (!state) return;
        setActiveQuoteQuantity(quantity);
        setActivePersistedQuoteState(state);
        setActiveQuoteData(quoteDataFromPersistedState(state));
        setActiveQuotePayload((prev) => (prev ? { ...prev, num_standees: quantity } : prev));
    }

function handleQuantityVariantSaved(quantity: number, state: PersistedQuoteState) {
    setActiveQuantityVariants((prev) => ({ ...prev, [String(quantity)]: state }));
    if (activeQuoteQuantity === quantity) setActivePersistedQuoteState(state);
}

    // Called when vision processing completes and returns detected elements
    function handleVisionElementsLoaded(raw: { id: number; width: number; height: number; mask_b64?: string }[]) {
        const mapped: Element[] = raw.map((r, i) => ({
            id: Date.now() + i,
            height: r.height,
            width: r.width,
            complexity: "Simple",
            linear_inches: 0,
            description: `Vision element ${r.id + 1}`,
            maskImage: r.mask_b64 ? `data:image/jpeg;base64,${r.mask_b64}` : undefined,
            originalHeight: r.height,
            originalWidth: r.width,
        }));
        setElements((prev) => [...prev, ...mapped]);
        if (activeProjectId) setIsDirty(true);
    }

    // ── Toast JSX (shared between both views) ─────────────────────────────
    const toastJsx = toast && (
        <div
            className={`fixed top-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
                toastVisible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
            }`}
        >
            <div className={`flex items-center gap-3 rounded-sm border-2 px-5 py-3 shadow-2xl ${
                toast.type === "delete" ? "border-red-400 bg-[#000005]" : "border-[#FFC843] bg-[#000005]"
            }`}>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                    toast.type === "delete" ? "text-red-400" : "text-[#FFC843]"
                }`}>
                    {toast.type === "delete" ? "// DELETED" : "// SAVED"}
                </span>
                <span className="text-xs font-semibold text-white">{toast.message}</span>
            </div>
        </div>
    );

    // ── Loading screen (while quote is being generated) ───────────────────
    if (isQuoteGenerating) {
        return (
            <div className="flex flex-col items-center justify-center w-full flex-1 bg-white">
                <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-2">// PROCESSING</div>
                <div className="text-3xl font-black text-[#000005] uppercase tracking-tight mb-6">Calculating Quote</div>
                <div className="flex gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-3 h-3 rounded-full bg-[#FFC843] animate-bounce" />
                </div>
            </div>
        );
    }

    // ── Quote breakdown view (shown after generating or loading a saved quote) ─
    if (activeQuoteData && activeQuotePayload && activeQuoteQuantity !== null) {
        return (
            <>
                <QuoteBreakdown
                    key={`${activePersistedQuoteId ?? "draft"}:${activeQuoteQuantity}`}
                    quoteData={activeQuoteData}
                    numStandees={activeQuotePayload.num_standees}
                    requestPayload={activeQuotePayload}
                    initialActiveScenario={1}
                    quoteName={activeQuoteName}
                    initialContributionMargin={activeQuoteContributionMargin}
                    persistedQuoteId={activePersistedQuoteId}
                    persistedState={activePersistedQuoteState}
                    quoteOwner={activeProjectOwner ?? authUsername}
                    noteAuthor={authUsername}
                    onBack={clearActiveQuote}
                    availableQuantities={validStandeeCounts.filter(
                        (quantity) => activeQuantityVariants[String(quantity)] !== undefined,
                    )}
                    activeQuantity={activeQuoteQuantity}
                    quantityVariants={activeQuantityVariants}
                    onQuantityChange={selectActiveQuoteQuantity}
                    onQuantityVariantSaved={handleQuantityVariantSaved}
                    costsStale={activeProjectCostsStale}
                    onCostsSynced={() => setProjectListRefreshKey((v) => v + 1)}
                />
                {toastJsx}
            </>
        );
    }

    // ── Estimator view (default) ───────────────────────────────────────────
    return (
        <>
        <UploadBlueModal open={uploadBlueOpen} onClose={() => setUploadBlueOpen(false)} onElementsLoaded={handleVisionElementsLoaded} />
        {activeProjectId && (
            <HistoryModal
                open={historyModalOpen}
                onClose={() => setHistoryModalOpen(false)}
                projectId={activeProjectId}
                owner={activeProjectOwner ?? authUsername ?? ""}
                onReverted={(entityType, label) => {
                    if (entityType === "project") void loadProject(activeProjectId);
                    showToast(`Reverted ${label}`, "save");
                }}
            />
        )}
        <div className="flex flex-row w-full flex-1 min-h-0 overflow-hidden bg-[#F8F8F8]">

            <ProjectSidebar
                activeProjectId={activeProjectId}
                currentUser={currentUser}
                isAdmin={isAdmin}
                projects={filteredProjects}
                hasProjects={projectList.length > 0}
                isLoading={projectListLoading}
                error={projectListError}
                searchQuery={projectSearchQuery}
                onSearchChange={setProjectSearchQuery}
                onNewProject={resetEstimatorForm}
                onLoadProject={(id) => void loadProject(id)}
                onDeleteProject={(id, label) => void deleteProject(id, label)}
                onRenameProject={(id, name) => void renameProject(id, name)}
                onDuplicateProject={(id, label) => void duplicateProject(id, label)}
            />

            {/* Main estimator form */}
            <div className="flex flex-col items-center flex-1 min-w-0 min-h-0 overflow-hidden px-8 py-6 bg-white">
                <div className="w-full max-w-3xl mb-4 shrink-0">
                    <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// ESTIMATOR</div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-3xl font-black text-[#000005] uppercase tracking-tight">Quote Estimate</div>
                        {activeProjectShortId && (
                            <span
                                title="Project ID"
                                className="text-[11px] font-black tracking-widest text-[#000005] bg-[#FFC843]/25 border border-[#FFC843] rounded-sm px-2 py-1 tabular-nums"
                            >
                                ID #{activeProjectShortId}
                            </span>
                        )}
                        {activeProjectOwner && (
                            <span
                                title="Created by"
                                className="text-[11px] font-bold tracking-wide text-[#64748B] bg-[#F1F5F9] border border-[#E0E0E0] rounded-sm px-2 py-1"
                            >
                                Created by {activeProjectOwner}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">Configure parameters to generate a cost estimate</p>
                </div>

                <div className="flex flex-col w-full max-w-4xl flex-1 min-h-0 border-2 bg-white border-[#E0E0E0] rounded-md text-[#B1B3B6] overflow-hidden">

                    {/* 01 — project config */}
                    <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#E0E0E0] shrink-0">
                        <div className="text-[10px] font-black mb-3 uppercase tracking-widest text-[#000005]">
                            <span className="text-[#FFC843]">// </span>01 — PROJECT DETAILS
                        </div>
                        <div className="flex flex-col gap-4 w-full">
                        <div className="flex flex-row gap-4 w-full">
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">Project name</div>
                                <input
                                    type="text"
                                    value={projectName}
                                    onChange={(e) => { setProjectName(e.target.value); if (activeProjectId) setIsDirty(true); }}
                                    placeholder="Untitled project"
                                    className="border-2 bg-white border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-full bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold mb-2 uppercase tracking-wider text-[#B1B3B6]">Standee Type</div>
                                <Dropdown
                                    key={elementListKey}
                                    options={["Simple", "Moderate", "Complex"]}
                                    currOption={standeeType}
                                    onSelect={(val: StandeeType) => { setStandeeType(val); if (activeProjectId) setIsDirty(true); }}
                                    width="w-full"
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6]">Quote Quantities (1–5)</div>
                                {!hasValidStandeeCounts && (
                                    <span className="text-[9px] font-bold text-red-600">Enter 1–5 unique positive quantities</span>
                                )}
                            </div>
                            <div className="grid grid-cols-5 gap-3">
                                {standeeCounts.map((count, index) => (
                                    <label key={index} className="flex flex-col gap-1">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#B1B3B6]">
                                            Quantity {index + 1}
                                        </span>
                                <input
                                    type="number"
                                            min={1}
                                            step={1}
                                            value={count}
                                            onChange={(e) => {
                                                const value = e.target.value === "" ? "" : Number(e.target.value);
                                                setStandeeCounts((prev) => prev.map((item, i) => (i === index ? value : item)));
                                                if (activeProjectId) setIsDirty(true);
                                            }}
                                            placeholder={String(DEFAULT_STANDEE_COUNTS[index])}
                                    className="border-2 bg-white border-[#E0E0E0] rounded-sm p-1.5 outline-none text-[#000005] text-xs w-full bg-[#F8F8F8] focus:border-[#FFC843] font-semibold transition-colors"
                                />
                                    </label>
                                ))}
                            </div>
                        </div>
                        </div>
                    </div>

                    {/* 02 — element list */}
                    <div className="flex flex-col flex-1 min-h-0 items-start w-full p-4 border-b-2 border-[#E0E0E0] overflow-hidden">
                        <div className="text-[10px] font-black mb-3 uppercase tracking-widest text-[#000005]">
                            <span className="text-[#FFC843]">// </span>02 — ELEMENTS
                            <span className="ml-2 text-[#FFC843] font-bold">({elements.length} added)</span>
                        </div>
                        <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                            <ElementsManager key={elementListKey} elements={elements} setElements={dirtySetElements} />
                        </div>
                    </div>

                    {/* Include Print Sides */}
                    <div className="flex w-full flex-row items-center px-4 py-3 border-b-2 border-[#E0E0E0] shrink-0">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={includePrintSides}
                                onClick={() => {
                                    setIncludePrintSides((v) => {
                                        const next = !v;
                                        // Toggling back to the last-saved value shouldn't dirty the project.
                                        if (activeProjectId && next !== savedIncludePrintSides) setIsDirty(true);
                                        return next;
                                    });
                                }}
                                className={`flex items-center justify-center w-5 h-5 rounded-sm border-2 transition-colors ${
                                    includePrintSides ? "bg-[#FFC843] border-[#FFC843]" : "bg-white border-[#E0E0E0]"
                                }`}
                            >
                                {includePrintSides && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000005" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                            <span className="text-xs font-bold text-[#000005]">Include Print Sides</span>
                        </label>
                    </div>

                    {/* Action buttons */}
                    <div className="flex w-full flex-row items-center px-4 py-3 gap-3 shrink-0 flex-wrap">
                        <div
                            onClick={activeProjectId ? () => setHistoryModalOpen(true) : resetEstimatorForm}
                            className="text-xs text-center font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-3 rounded-sm flex-1 min-w-[100px] cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200 uppercase tracking-widest"
                        >
                            {activeProjectId ? "VIEW HISTORY" : "CLEAR"}
                        </div>
                        <div
                            onClick={() => setUploadBlueOpen(true)}
                            className="text-xs text-center font-black text-[#B1B3B6] border-2 border-[#E0E0E0] py-3 rounded-sm flex-1 min-w-[100px] cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6] transition-all duration-200 uppercase tracking-widest"
                        >
                            UPLOAD BLUE
                        </div>
                        <div
                            onClick={canCalculate ? () => void handleSave() : undefined}
                            className={`text-xs text-center font-black py-3 rounded-sm flex-1 min-w-[100px] transition-all duration-200 uppercase tracking-widest ${
                                canCalculate
                                    ? "border-2 border-[#000005] text-[#000005] bg-white hover:bg-[#F4F4F4] cursor-pointer"
                                    : "border-2 border-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                            }`}
                        >
                            SAVE
                        </div>
                        <div
                            onClick={canCalculate && !isSavingBeforeContinue && !(activeProjectId && isDirty) ? () => void handleContinue() : undefined}
                            className={`group flex flex-row justify-center gap-4 text-xs font-black py-3 rounded-sm flex-[2] min-w-[180px] transition-all duration-200 ease-in-out uppercase tracking-widest ${
                                canCalculate && !isSavingBeforeContinue && !(activeProjectId && isDirty)
                                    ? "bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white cursor-pointer"
                                    : "bg-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                            }`}
                        >
                            {isSavingBeforeContinue ? "SAVING…"
                                : activeProjectId && isDirty ? "VIEW QUOTE"
                                : activeProjectId && needsRecalc ? "RE-CALCULATE QUOTE"
                                : activeProjectId ? "VIEW QUOTE"
                                : "BUILD QUOTE"}{" "}
                            <img
                                src="/submitarrow.svg"
                                alt=""
                                className={`transition-all duration-300 ease-in-out ${
                                    canCalculate && !isSavingBeforeContinue && !(activeProjectId && isDirty)
                                        ? "group-hover:translate-x-1 group-hover:invert"
                                        : "opacity-40"
                                }`}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {toastJsx}
        </>
    );
}
