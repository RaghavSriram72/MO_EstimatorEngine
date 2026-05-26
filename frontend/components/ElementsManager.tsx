"use client";
import { useEffect, useState } from "react";
import Dropdown from "@/components/Dropdown";
import ElementMaskModal from "@/components/ElementMaskModal";

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

const complexityOptions = ["Simple", "Moderate", "Complex"];

const complexityColor: Record<string, string> = {
    Simple:   "bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]",
    Moderate: "bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]",
    Complex:  "bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]",
};

type Props = {
    elements: Element[];
    setElements: (elements: Element[]) => void;
};

export default function ElementsManager({ elements, setElements }: Props) {
    const [height, setHeight] = useState<number | "">("");
    const [width, setWidth] = useState<number | "">("");
    const [complexity, setComplexity] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [linearInches, setLinearInches] = useState<number | "">("");
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [viewMask, setViewMask] = useState<{ image: string; label: string } | null>(null);
    const [scalePrompt, setScalePrompt] = useState<{ scale: number; sourceId: number } | null>(null);
    const [promptVisible, setPromptVisible] = useState(false);
    const [editSnapshot, setEditSnapshot] = useState<{ id: number; height: number | ""; width: number | "" } | null>(null);

    useEffect(() => {
        if (scalePrompt) {
            const id = setTimeout(() => setPromptVisible(true), 20);
            return () => clearTimeout(id);
        } else {
            setPromptVisible(false);
        }
    }, [scalePrompt]);

    function handleAdd() {
        if (height === "" || width === "" || !complexity) return;
        setElements([
            ...elements,
            {
                id: Date.now(),
                height,
                width,
                complexity,
                linear_inches: linearInches === "" ? 0 : Number(linearInches),
                description: descriptionDraft,
            },
        ]);
        setHeight("");
        setWidth("");
        setComplexity("");
        setLinearInches("");
        setDescriptionDraft("");
    }

    function handleDelete(id: number) {
        setElements(elements.filter((e) => e.id !== id));
        if (editingId === id) setEditingId(null);
    }

    function handleChange(id: number, field: keyof Element, value: any) {
        setElements(elements.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    }

    function dismissPrompt() {
        setPromptVisible(false);
        setTimeout(() => setScalePrompt(null), 300);
    }

    function handleDone(el: Element) {
        setEditingId(null);
        const isVision =
            typeof el.description === "string" &&
            el.description.toLowerCase().includes("vision");
        const snap = editSnapshot;
        setEditSnapshot(null);
        if (
            isVision &&
            snap &&
            snap.id === el.id &&
            typeof snap.height === "number" && snap.height > 0 &&
            typeof el.height === "number" && el.height > 0
        ) {
            const scale = el.height / snap.height;
            const otherVision = elements.filter(
                (e) =>
                    e.id !== el.id &&
                    typeof e.description === "string" &&
                    e.description.toLowerCase().includes("vision"),
            );
            if (Math.abs(scale - 1) > 0.0001 && otherVision.length > 0) {
                setScalePrompt({ scale, sourceId: el.id });
            }
        }
    }

    function handleAutofillScale() {
        if (!scalePrompt) return;
        setElements(
            elements.map((el) => {
                if (
                    el.id !== scalePrompt.sourceId &&
                    typeof el.description === "string" &&
                    el.description.toLowerCase().includes("vision") &&
                    typeof el.height === "number" &&
                    typeof el.width === "number"
                ) {
                    return {
                        ...el,
                        height: Math.round(el.height * scalePrompt.scale * 100) / 100,
                        width: Math.round(el.width * scalePrompt.scale * 100) / 100,
                    };
                }
                return el;
            }),
        );
        dismissPrompt();
    }

    const inputCls = "border-2 border-[#E0E0E0] rounded-sm px-1 py-0.5 outline-none text-[#000005] text-xs bg-white w-full focus:border-[#FFC843] transition-colors font-semibold";

    return (
        <>
        <div className="flex flex-col gap-4 w-full h-full min-h-0">
            <ElementMaskModal
                open={!!viewMask}
                onClose={() => setViewMask(null)}
                maskImage={viewMask?.image ?? ""}
                elementLabel={viewMask?.label ?? ""}
            />
            {/* Add new element — single compact row */}
            <div className="flex items-end gap-2 w-full shrink-0 rounded-sm border-2 border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2">
                <div className="min-w-0 w-20">
                    <div className="text-[9px] font-bold mb-0.5 text-[#B1B3B6] uppercase tracking-wider">Length</div>
                    <input
                        type="number"
                        min={0}
                        value={height}
                        onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="0"
                        className={inputCls}
                    />
                </div>
                <div className="min-w-0 w-20">
                    <div className="text-[9px] font-bold mb-0.5 text-[#B1B3B6] uppercase tracking-wider">Width</div>
                    <input
                        type="number"
                        min={0}
                        value={width}
                        onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="0"
                        className={inputCls}
                    />
                </div>
                <div className="min-w-0 w-32">
                    <div className="text-[9px] font-bold mb-0.5 text-[#B1B3B6] uppercase tracking-wider">Complexity</div>
                    <Dropdown
                        options={complexityOptions}
                        currOption={complexity || null}
                        onSelect={(val: string) => setComplexity(val)}
                        width="w-full"
                    />
                </div>
                <div className="min-w-0 w-20">
                    <div className="text-[9px] font-bold mb-0.5 text-[#B1B3B6] uppercase tracking-wider">Linear In.</div>
                    <input
                        type="number"
                        min={0}
                        value={linearInches}
                        onChange={(e) => setLinearInches(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="—"
                        className={inputCls}
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold mb-0.5 text-[#B1B3B6] uppercase tracking-wider">Description</div>
                    <input
                        type="text"
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        placeholder="—"
                        className={inputCls}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={height === "" || width === "" || !complexity}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white cursor-pointer transition-all duration-200 hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    + ADD
                </button>
            </div>

            {/* Scrollable list — horizontal scroll on narrow containers so columns never overlap */}
            <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-2 overflow-y-auto">
                {elements.length === 0 ? (
                    <div className="text-[12px] text-[#B1B3B6] font-semibold">No elements added yet.</div>
                ) : (
                    <div className="w-full min-w-0 overflow-x-auto pb-1">
                        <div className="inline-block min-w-[640px] w-full max-w-none align-top">
                        <div
                            className="grid w-full gap-x-2 gap-y-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6]"
                            style={{
                                gridTemplateColumns:
                                    "28px minmax(0,1fr) minmax(0,1fr) minmax(7.5rem,1.1fr) minmax(5rem,0.9fr) minmax(6rem,1.2fr) 1.75rem 3.25rem 1.75rem",
                            }}
                        >
                            <span>#</span>
                            <span>Height</span>
                            <span>Width</span>
                            <span>Complexity</span>
                            <span>Linear In.</span>
                            <span>Description</span>
                            <span className="text-center"> </span>
                            <span className="text-center"> </span>
                            <span className="text-center"> </span>
                        </div>
                        {elements.map((el, idx) => (
                            <div
                                key={el.id}
                                className="grid w-full items-center gap-x-2 gap-y-0.5 rounded-sm border-2 border-[#E0E0E0] bg-[#F8F8F8] px-2 py-1"
                                style={{
                                    gridTemplateColumns:
                                        "28px minmax(0,1fr) minmax(0,1fr) minmax(7.5rem,1.1fr) minmax(5rem,0.9fr) minmax(6rem,1.2fr) 1.75rem 3.25rem 1.75rem",
                                }}
                            >
                                <span className="text-[10px] font-bold text-[#B1B3B6]">{idx + 1}</span>

                                {editingId === el.id ? (
                                    <>
                                        <div className="min-w-0">
                                            <input
                                                type="number"
                                                value={el.height}
                                                onChange={(e) => handleChange(el.id, "height", e.target.value === "" ? "" : Number(e.target.value))}
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <input
                                                type="number"
                                                value={el.width}
                                                onChange={(e) => handleChange(el.id, "width", e.target.value === "" ? "" : Number(e.target.value))}
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <Dropdown
                                                options={complexityOptions}
                                                currOption={el.complexity}
                                                onSelect={(val: string) => handleChange(el.id, "complexity", val)}
                                                width="w-full"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <input
                                                type="number"
                                                value={el.linear_inches}
                                                onChange={(e) => handleChange(el.id, "linear_inches", e.target.value === "" ? "" : Number(e.target.value))}
                                                placeholder="—"
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <input
                                                type="text"
                                                value={el.description}
                                                onChange={(e) => handleChange(el.id, "description", e.target.value)}
                                                placeholder="—"
                                                className={inputCls}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="min-w-0 truncate text-xs font-semibold text-[#000005]">{el.height}"</span>
                                        <span className="min-w-0 truncate text-xs font-semibold text-[#000005]">{el.width}"</span>
                                        <div className="min-w-0">
                                            <span
                                                className={`inline-block max-w-full truncate text-[10px] font-bold rounded-sm border px-2 py-0.5 ${complexityColor[el.complexity] ?? ""}`}
                                            >
                                                {el.complexity}
                                            </span>
                                        </div>
                                        <span className="min-w-0 text-xs font-semibold text-[#000005]">
                                            {el.linear_inches !== "" ? `${el.linear_inches}"` : <span className="text-[#B1B3B6]">—</span>}
                                        </span>
                                        <span
                                            className="min-w-0 truncate text-[10px] font-semibold text-[#000005]"
                                            title={el.description || undefined}
                                        >
                                            {el.description ? el.description : <span className="text-[#B1B3B6]">—</span>}
                                        </span>
                                    </>
                                )}

                                {el.maskImage ? (
                                    <button
                                        type="button"
                                        title="View element"
                                        onClick={() => setViewMask({ image: el.maskImage!, label: el.description ? String(el.description) : `Element ${idx + 1}` })}
                                        className="justify-self-stretch flex items-center justify-center text-[#FFC843] border-2 border-[#FFC843] rounded-sm px-1 py-1 cursor-pointer hover:bg-[#FFC843] hover:text-[#000005] transition-all duration-200"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: "14px", lineHeight: 1 }}>visibility</span>
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (editingId === el.id) {
                                            handleDone(el);
                                        } else {
                                            setEditingId(el.id);
                                            setEditSnapshot({ id: el.id, height: el.height, width: el.width });
                                        }
                                    }}
                                    className="justify-self-stretch text-center text-[10px] font-bold text-[#B1B3B6] border-2 border-[#E0E0E0] rounded-sm px-1 py-1 cursor-pointer hover:bg-[#E0E0E0] hover:text-[#000005] transition-all duration-200"
                                >
                                    {editingId === el.id ? "Done" : "Edit"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(el.id)}
                                    className="justify-self-stretch text-center text-[10px] font-bold text-red-400 border-2 border-red-100 rounded-sm px-1 py-1 cursor-pointer hover:bg-red-50 transition-all duration-200"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

            {scalePrompt && (
                <div
                    className={`fixed top-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
                        promptVisible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
                    }`}
                >
                    <div className="flex min-w-[320px] max-w-[460px] flex-col gap-3 rounded-sm border-2 border-[#FFC843] bg-[#000005] px-6 py-4 shadow-2xl">
                        <div className="text-[10px] font-black uppercase tracking-widest">
                            <span className="text-[#FFC843]">// </span>
                            <span className="text-white">SCALE DETECTED</span>
                        </div>
                        <p className="text-xs font-semibold leading-snug text-white">
                            Scale factor{" "}
                            <span className="font-black text-[#FFC843]">
                                {scalePrompt.scale.toFixed(3)}×
                            </span>{" "}
                            detected. Apply to all Vision elements?
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleAutofillScale}
                                className="flex-1 rounded-sm bg-[#FFC843] py-2.5 text-[10px] font-black uppercase tracking-widest text-[#000005] transition-colors duration-150 hover:bg-white"
                            >
                                AUTOFILL ALL VISION
                            </button>
                            <button
                                type="button"
                                onClick={dismissPrompt}
                                className="rounded-sm border-2 border-[#444] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#888] transition-colors duration-150 hover:border-white hover:text-white"
                            >
                                SKIP
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
