type Props = {
    label: string;
    value: number;
    originalValue: number;
    onChange: (value: string) => void;
    step?: number;
};

export default function EditableValueBox({ label, value, originalValue, onChange, step = 0.01 }: Props) {
    const isDirty = value !== originalValue;
    return (
        <div
            className={`flex flex-col justify-between px-3 py-2.5 border-2 rounded-md transition-colors ${
                isDirty ? "border-[#FFB604] bg-[#FFFDF5]" : "border-[#EDEAEA]"
            }`}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wide text-[#ABABAB]">{label}</span>
                {isDirty && (
                    <span className="text-[8px] text-[#FFB604] font-bold tracking-wider">CHANGED</span>
                )}
            </div>
            <span className="flex flex-row gap-1 text-[#FFB604] align-center justify-center">
                $
                <input
                type="number"
                step={step}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="text-[1.15em] font-instrument text-[#FFB604] bg-transparent outline-none w-full"
                />
            </span>
            
        </div>
    );
}
