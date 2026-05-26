"use client";

type Props = {
    open: boolean;
    onClose: () => void;
    maskImage: string;
    elementLabel: string;
};

export default function ElementMaskModal({ open, onClose, maskImage, elementLabel }: Props) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-white rounded-sm border-2 border-[#E0E0E0] shadow-xl w-full max-w-md mx-4 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[#E0E0E0]">
                    <div>
                        <div className="text-[10px] font-black text-[#FFC843] uppercase tracking-widest">// VISION</div>
                        <div className="text-sm font-black text-[#000005] uppercase tracking-tight">{elementLabel}</div>
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
                    <img src={maskImage} alt={elementLabel} className="w-full object-contain rounded-sm" />
                </div>
            </div>
        </div>
    );
}
