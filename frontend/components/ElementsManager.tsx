"use client";
import { useState } from "react";
import Dropdown from "@/components/Dropdown";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
    description: string | "";
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

    const inputCls = "border-2 border-[#E0E0E0] rounded-sm p-1 outline-none text-[#000005] text-xs bg-white w-full focus:border-[#FFC843] transition-colors font-semibold";

    return (
        <div className="flex flex-col gap-4 w-full h-full min-h-0">
            {/* Add new element — two rows so dropdowns and inputs never overlap */}
            <div className="flex flex-col gap-3 w-full shrink-0 rounded-sm border-2 border-[#E0E0E0] bg-[#FAFAFA] p-3">
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold mb-1 text-[#B1B3B6] uppercase tracking-wider">Length (in)</div>
                        <input
                            type="number"
                            min={0}
                            value={height}
                            onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
                            placeholder="0"
                            className={inputCls}
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold mb-1 text-[#B1B3B6] uppercase tracking-wider">Width (in)</div>
                        <input
                            type="number"
                            min={0}
                            value={width}
                            onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
                            placeholder="0"
                            className={inputCls}
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold mb-1 text-[#B1B3B6] uppercase tracking-wider">Complexity</div>
                        <Dropdown
                            options={complexityOptions}
                            currOption={complexity || null}
                            onSelect={(val: string) => setComplexity(val)}
                            width="w-full"
                        />
                    </div>
                </div>
                <div className="grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,11rem)_1fr_auto]">
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold mb-1 text-[#B1B3B6] uppercase tracking-wider">
                            Linear In. <span className="font-normal normal-case">(opt.)</span>
                        </div>
                        <input
                            type="number"
                            min={0}
                            value={linearInches}
                            onChange={(e) => setLinearInches(e.target.value === "" ? "" : Number(e.target.value))}
                            placeholder="—"
                            className={inputCls}
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold mb-1 text-[#B1B3B6] uppercase tracking-wider">
                            Description <span className="font-normal normal-case">(opt.)</span>
                        </div>
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
                        className="h-[34px] shrink-0 self-end text-xs font-bold px-4 rounded-sm border-2 border-[#000005] bg-[#000005] text-white cursor-pointer transition-all duration-200 hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap sm:h-auto sm:py-1.5"
                    >
                        + ADD
                    </button>
                </div>
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
                                    "28px minmax(0,1fr) minmax(0,1fr) minmax(7.5rem,1.1fr) minmax(5rem,0.9fr) minmax(6rem,1.2fr) 3.25rem 1.75rem",
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
                        </div>
                        {elements.map((el, idx) => (
                            <div
                                key={el.id}
                                className="grid w-full items-center gap-x-2 gap-y-1 rounded-sm border-2 border-[#E0E0E0] bg-[#F8F8F8] px-2 py-2"
                                style={{
                                    gridTemplateColumns:
                                        "28px minmax(0,1fr) minmax(0,1fr) minmax(7.5rem,1.1fr) minmax(5rem,0.9fr) minmax(6rem,1.2fr) 3.25rem 1.75rem",
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

                                <button
                                    type="button"
                                    onClick={() => setEditingId(editingId === el.id ? null : el.id)}
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
    );
}
