"use client";

import { useState } from "react";
import '../app/globals.css';

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
        <div className="chatbox flex flex-col flex-1 items-center justify-start pb-0 border-t-2 border-[#EDEAEA] max-h-[200px]">
            <div className="input-area w-full py-4 px-4">
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter your requirements..." 
                    className="chat w-full h-32 p-4 text-black rounded-lg outline-none focus:outline-none focus:ring-0 resize-none shadow-xl" 
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
}