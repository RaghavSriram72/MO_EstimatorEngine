export default function ConfirmAlert({ visible, message, onConfirm, onCancel }: {
    visible: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div className={`${visible ? "show-alert" : "hide-alert"} ${visible ? "" : "pointer-events-none"} fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-[#EDEAEA] rounded-md shadow-lg px-6 py-4 flex items-center gap-6 min-w-[420px]`}>
            <span className="text-md flex-1 text-black">{message}</span>
            <button
                onClick={onCancel}
                className="text-s font-bold text-[#ABABAB] hover:text-black transition-colors"
            >
                CANCEL
            </button>
            <button
                onClick={onConfirm}
                className="text-s font-bold bg-[#000005] text-[#FFC843] px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
            >
                DELETE
            </button>
        </div>
    );
}
