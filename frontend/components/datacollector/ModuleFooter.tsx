"use client";

// Shared secondary-action / SUBMIT UPDATE footer used by every DataCollector module.
// Most modules use the secondary slot for HISTORY; StandeeModule still uses it for CLEAR.

type Props = {
    isDirty: boolean;
    isSaving: boolean;
    secondaryLabel: string;
    onSecondaryAction: () => void;
    onSubmit: () => void;
    secondaryDisabled?: boolean;
};

export default function ModuleFooter({
    isDirty, isSaving, secondaryLabel, onSecondaryAction, onSubmit, secondaryDisabled,
}: Props) {
    return (
        <div className="flex w-full flex-row items-center px-4 py-3 gap-4 border-t-2 border-[#EDEAEA] shrink-0">
            <div
                onClick={secondaryDisabled ? undefined : onSecondaryAction}
                className={`text-xs text-center font-black py-3 rounded-sm flex-1 uppercase tracking-widest transition-all duration-200 border-2 ${
                    secondaryDisabled
                        ? "text-[#DEDEDE] border-[#EDEAEA] cursor-not-allowed"
                        : "text-[#B1B3B6] border-[#E0E0E0] cursor-pointer hover:bg-[#F4F4F4] hover:text-[#000005] hover:border-[#B1B3B6]"
                }`}
            >
                {secondaryLabel}
            </div>
            <div
                onClick={isDirty && !isSaving ? onSubmit : undefined}
                className={`group flex flex-row justify-center gap-4 text-xs font-black py-3 rounded-sm flex-[2] transition-all duration-200 ease-in-out uppercase tracking-widest ${
                    isDirty && !isSaving
                        ? "bg-[#FFC843] text-[#000005] hover:bg-[#000005] hover:text-white cursor-pointer"
                        : "bg-[#E0E0E0] text-[#B1B3B6] cursor-not-allowed"
                }`}
            >
                {isSaving ? "SAVING..." : "SUBMIT UPDATE"}
                {isDirty && !isSaving && (
                    <img
                        src="/submitarrow.svg"
                        alt=""
                        className="transition-all duration-300 ease-in-out group-hover:translate-x-1 group-hover:invert"
                    />
                )}
            </div>
        </div>
    );
}
