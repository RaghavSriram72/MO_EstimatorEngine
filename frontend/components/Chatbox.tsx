"use client";

import { useState } from "react";

interface ChatboxProps {
    messages: string[];
    setMessages: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function Chatbox({ messages, setMessages }: ChatboxProps) {
    const [input, setInput] = useState("");

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim()) {
                setMessages([...messages, input.trim()]);
                setMessages((prevMessages) => [...prevMessages, "ChatBot Response....".trim()]);
                setInput("");
            }
        }
    };

    return (
        <div className="chatbox flex flex-col flex-1 items-center justify-end pb-12">
            <div className="input-area w-full max-w-2xl px-4">
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter your requirements..." 
                    className="w-full h-32 p-4  text-black border border-yellow-500 rounded-lg outline-none focus:outline-none focus:ring-0 resize-none" 
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
}