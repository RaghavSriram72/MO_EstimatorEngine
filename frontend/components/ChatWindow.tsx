"use client";
import { useEffect, useRef } from "react";
import Chatbox from "./Chatbox";

const SUGGESTIONS = [
    "What's the cost for 50 complex standees?",
    "Compare Scenario 4 vs 5 for a retail display run",
    "Estimate a Foster full-outsource job",
];

const AIAvatar = () => (
    <div className="shrink-0 w-7 h-7 rounded-sm bg-[#000005] flex items-center justify-center shadow-sm">
        <span className="text-[9px] font-black text-[#FFC843] leading-none select-none">//</span>
    </div>
);

export default function ChatWindow({ messages, setMessages }: { messages: string[]; setMessages: React.Dispatch<React.SetStateAction<string[]>> }) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const isEmpty = messages.length === 0;

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-[#F8F8F8]">

            {/* Message feed — always rendered so the overlay can animate over it */}
            <div className="flex-1 min-h-0 overflow-y-auto relative">
                <div className="flex flex-col gap-5 px-6 py-6 max-w-3xl mx-auto w-full">
                    {messages.map((msg, index) => {
                        const isUser = index % 2 === 0;
                        return (
                            <div key={index} className={`flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                                {!isUser && <AIAvatar />}
                                <div
                                    className={`max-w-[70%] px-4 py-3 text-[13px] font-semibold leading-relaxed shadow-sm ${
                                        isUser
                                            ? "bg-[#000005] text-white rounded-tl-sm rounded-tr-sm rounded-bl-sm rounded-br-none"
                                            : "bg-white text-[#000005] border border-[#E8E8E8] rounded-tl-none rounded-tr-sm rounded-bl-sm rounded-br-sm"
                                    }`}
                                >
                                    {!isUser && (
                                        <div className="text-[9px] font-black text-[#FFC843] uppercase tracking-widest mb-1.5">
                                            // MIDNIGHT AI
                                        </div>
                                    )}
                                    {msg}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Welcome overlay — flies up and fades out when first message is sent */}
                <div className={`absolute inset-0 bg-[#F8F8F8] flex flex-col items-center justify-center gap-5 px-8 py-12 ${
                    isEmpty ? "chat-intro-inactive pointer-events-auto" : "chat-intro-active pointer-events-none"
                }`}>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-sm bg-[#000005] flex items-center justify-center shadow-lg">
                            <span className="text-[26px] font-black text-[#FFC843] leading-none select-none">//</span>
                        </div>
                        <div className="text-[2rem] font-black tracking-tight text-[#000005] uppercase text-center leading-none">
                            MIDNIGHT AI
                        </div>
                        <div className="text-[13px] text-[#B1B3B6] text-center font-semibold max-w-xs leading-relaxed">
                            Live pricing data and intelligent quote generation — at your fingertips.
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full max-w-sm mt-2">
                        {SUGGESTIONS.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setMessages([s, "This is a placeholder AI response. The backend is not yet connected."])}
                                className="w-full text-left border-2 border-[#E0E0E0] rounded-sm px-4 py-3 text-[12px] font-semibold text-[#B1B3B6] hover:border-[#FFC843] hover:text-[#000005] hover:bg-white cursor-pointer transition-all duration-200 bg-white"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Floating input */}
            <div className="shrink-0">
                <Chatbox setMessages={setMessages} />
            </div>
        </div>
    );
}
