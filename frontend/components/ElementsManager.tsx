"use client";
import { useState } from "react";
import Dropdown from "@/components/Dropdown";

type Element = {
    id: number;
    height: number | "";
    width: number | "";
    complexity: string;
    linear_inches: number | "";
};

const complexityOptions = ["Simple", "Moderate", "Complex"];

const complexityColor: Record<string, string> = {
    Simple: "bg-green-100 text-green-700 border-green-200",
    Moderate: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Complex: "bg-red-100 text-red-700 border-red-200",
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

    function handleAdd() {
        if (height === "" || width === "" || !complexity) return;
        setElements([...elements, { id: Date.now(), height, width, complexity, linear_inches: linearInches === "" ? 0 : Number(linearInches) }]);
        setHeight("");
        setWidth("");
        setComplexity("");
        setLinearInches("");
    }

    function handleDelete(id: number) {
        setElements(elements.filter((e) => e.id !== id));
        if (editingId === id) setEditingId(null);
    }

    function handleChange(id: number, field: keyof Element, value: any) {
        setElements(elements.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    }

    const inputCls = "border-2 border-[#EDEAEA] rounded-md p-1 outline-none text-black text-xs bg-[#FFFBED] w-full";

    return (
        <div className="flex flex-col gap-3 w-full h-full min-h-0">
            {/* Add row — always visible */}
            <div className="flex flex-row gap-3 items-end w-full shrink-0">
                <div className="flex-1">
                    <div className="text-xs font-bold mb-1 text-[#ABABAB]">Height (in)</div>
                    <input
                        type="number"
                        min={0}
                        value={height}
                        onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="0"
                        className={inputCls}
                    />
                </div>
                <div className="flex-1">
                    <div className="text-xs font-bold mb-1 text-[#ABABAB]">Width (in)</div>
                    <input
                        type="number"
                        min={0}
                        value={width}
                        onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="0"
                        className={inputCls}
                    />
                </div>
                <div className="flex-1">
                    <div className="text-xs font-bold mb-1 text-[#ABABAB]">Complexity</div>
                    <Dropdown
                        options={complexityOptions}
                        currOption={complexity || null}
                        onSelect={(val: string) => setComplexity(val)}
                    />
                </div>
                <div className="flex-1">
                    <div className="text-xs font-bold mb-1 text-[#ABABAB]">Linear In. <span className="font-normal">(opt.)</span></div>
                    <input
                        type="number"
                        min={0}
                        value={linearInches}
                        onChange={(e) => setLinearInches(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="—"
                        className={inputCls}
                    />
                </div>
                <button
                    onClick={handleAdd}
                    disabled={height === "" || width === "" || !complexity}
                    className="text-xs font-bold px-4 py-1 rounded-md border-2 border-black bg-black text-white cursor-pointer transition-all duration-200 hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    + Add
                </button>
            </div>

            {/* Scrollable list */}
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto gap-2">
                {elements.length === 0 ? (
                    <div className="text-[12px] text-[#CDCDCD] italic">No elements added yet.</div>
                ) : (
                    <>
                        <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_60px_28px] text-[10px] text-[#ABABAB] font-bold px-2 uppercase shrink-0">
                            <span>#</span>
                            <span>Height</span>
                            <span>Width</span>
                            <span>Complexity</span>
                            <span>Linear In.</span>
                            <span />
                            <span />
                        </div>
                        {elements.map((el, idx) => (
                            <div
                                key={el.id}
                                className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_60px_28px] items-center gap-2 bg-[#FAFAFA] border-2 border-[#EDEAEA] rounded-md px-2 py-2 shrink-0"
                            >
                                <span className="text-[10px] text-[#ABABAB] font-bold">{idx + 1}</span>

                                {editingId === el.id ? (
                                    <>
                                        <input
                                            type="number"
                                            value={el.height}
                                            onChange={(e) => handleChange(el.id, "height", e.target.value === "" ? "" : Number(e.target.value))}
                                            className={inputCls}
                                        />
                                        <input
                                            type="number"
                                            value={el.width}
                                            onChange={(e) => handleChange(el.id, "width", e.target.value === "" ? "" : Number(e.target.value))}
                                            className={inputCls}
                                        />
                                        <Dropdown
                                            options={complexityOptions}
                                            currOption={el.complexity}
                                            onSelect={(val: string) => handleChange(el.id, "complexity", val)}
                                        />
                                        <input
                                            type="number"
                                            value={el.linear_inches}
                                            onChange={(e) => handleChange(el.id, "linear_inches", e.target.value === "" ? "" : Number(e.target.value))}
                                            placeholder="—"
                                            className={inputCls}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <span className="text-xs text-black">{el.height}"</span>
                                        <span className="text-xs text-black">{el.width}"</span>
                                        <span className={`text-[10px] font-bold border rounded-md px-2 py-0.5 w-fit ${complexityColor[el.complexity] ?? ""}`}>
                                            {el.complexity}
                                        </span>
                                        <span className="text-xs text-black">{el.linear_inches !== "" ? `${el.linear_inches}"` : <span className="text-[#CDCDCD]">—</span>}</span>
                                    </>
                                )}

                                <button
                                    onClick={() => setEditingId(editingId === el.id ? null : el.id)}
                                    className="text-[10px] font-bold text-[#ABABAB] border-2 border-[#EDEAEA] rounded-md px-2 py-1 cursor-pointer hover:bg-[#EDEAEA] transition-all duration-200"
                                >
                                    {editingId === el.id ? "Done" : "Edit"}
                                </button>
                                <button
                                    onClick={() => handleDelete(el.id)}
                                    className="text-[10px] font-bold text-red-400 border-2 border-red-100 rounded-md px-1 py-1 cursor-pointer hover:bg-red-50 transition-all duration-200"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
