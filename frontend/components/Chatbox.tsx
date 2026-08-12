"use client";
import { useRef, useState } from "react";

interface ChatboxProps {
    setMessages: React.Dispatch<React.SetStateAction<string[]>>;
}

const IconSend = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
);

const IconPaperclip = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
);

export default function Chatbox({ setMessages }: ChatboxProps) {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function adjustHeight() {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setInput(e.target.value);
        adjustHeight();
    }

    function handleSend() {
        const trimmed = input.trim();
        if (!trimmed) return;
        setMessages((prev) => [
            ...prev,
            trimmed,
            "This is a placeholder AI response. The backend is not yet connected.",
        ]);
        setInput("");
        setTimeout(() => {
            if (textareaRef.current) textareaRef.current.style.height = "auto";
        }, 0);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    const canSend = input.trim().length > 0;

    return (
        <div className="px-8 pb-6 pt-3 max-w-3xl mx-auto w-full">
            <div
                className={`flex flex-col bg-white rounded-xl border transition-all duration-200 ${
                    canSend
                        ? "border-[#FFC843] shadow-[0_6px_32px_rgba(255,200,67,0.18)]"
                        : "border-[#E0E0E0] shadow-[0_6px_32px_rgba(0,0,0,0.08)] focus-within:border-[#FFC843] focus-within:shadow-[0_6px_32px_rgba(255,200,67,0.15)]"
                }`}
            >
                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about pricing, quotes, or standee configurations…"
                    rows={3}
                    className="w-full bg-transparent resize-none outline-none text-[13px] font-semibold text-[#000005] placeholder:text-[#B1B3B6] placeholder:font-normal leading-relaxed px-5 pt-4 pb-2"
                    style={{ minHeight: "72px", maxHeight: "180px" }}
                />

                {/* Bottom action row */}
                <div className="flex items-center justify-between px-4 pb-3 pt-1">
                    {/* File upload */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-8 h-8 flex items-center justify-center rounded-sm text-[#B1B3B6] hover:text-[#000005] hover:bg-[#F4F4F4] transition-all duration-200 cursor-pointer"
                        aria-label="Attach file"
                    >
                        <IconPaperclip />
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden" aria-hidden />

                    {/* Send button */}
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!canSend}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                            canSend
                                ? "bg-[#000005] text-white hover:bg-[#FFC843] hover:text-[#000005] cursor-pointer"
                                : "bg-[#F0F0F0] text-[#C0C0C0] cursor-not-allowed"
                        }`}
                    >
                        <IconSend />
                    </button>
                </div>
            </div>

            <div className="text-[10px] text-[#B1B3B6] font-semibold mt-2.5 text-center tracking-wide">
                Enter to send · Shift+Enter for new line
            </div>
        </div>
    );
}
