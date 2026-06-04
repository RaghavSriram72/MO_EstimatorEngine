"use client";
import { useEffect, useState } from "react";

type Props = {
    open: boolean;
    onClose: () => void;
    maskImage: string;
    elementLabel: string;
};

export default function ElementMaskModal({ open, onClose, maskImage, elementLabel }: Props) {
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);
    // Latch content so it doesn't disappear during the exit animation
    const [latchedImage, setLatchedImage] = useState("");
    const [latchedLabel, setLatchedLabel] = useState("");

    useEffect(() => {
        if (open) {
            setLatchedImage(maskImage);
            setLatchedLabel(elementLabel);
            setMounted(true);
            const id = setTimeout(() => setVisible(true), 10);
            return () => clearTimeout(id);
        } else {
            setVisible(false);
            const id = setTimeout(() => setMounted(false), 320);
            return () => clearTimeout(id);
        }
    }, [open, maskImage, elementLabel]);

    if (!mounted) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center transition-[background-color] duration-300 ${
                visible ? "bg-black/60" : "bg-black/0"
            }`}
        >
            <div className={`bg-white rounded-sm border-2 border-[#E0E0E0] shadow-xl w-full max-w-md mx-4 flex flex-col overflow-hidden ${
                visible ? "modal-slide-up" : "modal-slide-down"
            }`}>
                <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[#E0E0E0]">
                    <div>
                        <div className="text-[10px] font-black text-[#FFC843] uppercase tracking-widest">// VISION</div>
                        <div className="text-sm font-black text-[#000005] uppercase tracking-tight">{latchedLabel}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-red-400 hover:text-red-600 hover:cursor-pointer text-xl font-black transition-colors leading-none"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={latchedImage} alt={latchedLabel} className="w-full object-contain rounded-sm" />
                </div>
            </div>
        </div>
    );
}
