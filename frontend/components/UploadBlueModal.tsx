"use client";
import { useRef, useState } from "react";
import { API_BASE } from "@/lib/config";

type VisionElement = { id: number; width: number; height: number; mask_b64?: string };

type Props = {
    open: boolean;
    onClose: () => void;
    onElementsLoaded: (elements: VisionElement[]) => void;
};

export default function UploadBlueModal({ open, onClose, onElementsLoaded }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    if (!open) return null;

    function acceptFile(f: File) {
        setFile(f);
        setError(null);
        setPreview(URL.createObjectURL(f));
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith("image/")) acceptFile(f);
    }

    function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (f) acceptFile(f);
    }

    function handleRemove() {
        setFile(null);
        setPreview(null);
        setError(null);
        if (inputRef.current) inputRef.current.value = "";
    }

    async function handleSubmit() {
        if (!file) return;
        setIsProcessing(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${API_BASE}/vision/process`, { method: "POST", body: form });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? "Processing failed"); return; }
            onElementsLoaded(data.elements ?? []);
            onClose();
        } catch {
            setError("Network error — could not reach the server.");
        } finally {
            setIsProcessing(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-sm border-2 border-[#E0E0E0] shadow-xl w-full max-w-2xl mx-4 flex flex-col gap-0 overflow-hidden min-h-[600px]">

                {/* Header */}
                <div className="flex items-center justify-between px-10 py-4 border-b-2 border-[#E0E0E0]">
                    <div>
                        <div className="text-[10px] font-black text-[#FFC843] uppercase tracking-widest">// VISION</div>
                        <div className="text-sm font-black text-[#000005] uppercase tracking-tight">Upload Blueprint</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-grey-400 hover:text-red-600 hover:cursor-pointer text-xl font-black transition-colors leading-none"
                    >
                        ✕
                    </button>
                </div>

                {/* Drop zone */}
                <div className="p-5">
                    {!file ? (
                        <div
                            onClick={() => inputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-sm cursor-pointer py-40 transition-colors ${
                                isDragging ? "border-[#FFC843] bg-[#FFF8E1]" : "border-[#E0E0E0] hover:border-[#B1B3B6] bg-[#F8F8F8]"
                            }`}
                        >
                            <div className="text-3xl text-[#B1B3B6]">↑</div>
                            <div className="text-xs font-bold text-[#000005] uppercase tracking-wider">Drag & drop an image</div>
                            <div className="text-[10px] text-[#B1B3B6] font-semibold">or click to browse — PNG, JPG, WEBP</div>
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileInput}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="relative rounded-sm overflow-hidden border-2 border-[#E0E0E0] bg-[#F8F8F8]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={preview!} alt="preview" className="w-full max-h-96 object-contain" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#000005] truncate max-w-[280px]">{file.name}</span>
                                <button
                                    onClick={handleRemove}
                                    className="text-[10px] font-bold text-[#B1B3B6] hover:text-red-400 transition-colors uppercase tracking-wider shrink-0"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="px-5 pb-3 text-[10px] font-semibold text-red-500">{error}</div>
                )}

                {/* Footer */}
                <div className="flex gap-3 px-5 py-4 border-t-2 border-[#E0E0E0] mt-auto">
                    <button
                        onClick={onClose}
                        className="flex-1 text-xs font-black uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#E0E0E0] text-[#B1B3B6] hover:bg-[#F4F4F4] hover:text-[#000005] transition-all duration-200"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!file || isProcessing}
                        className="flex-[2] text-xs font-black uppercase tracking-widest py-2.5 rounded-sm bg-[#000005] text-[#FFC843] hover:bg-[#FFC843] hover:text-[#000005] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? "Processing..." : "Process Image"}
                    </button>
                </div>
            </div>
        </div>
    );
}
