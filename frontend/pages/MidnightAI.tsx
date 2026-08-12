'use client';
import React from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";

export default function MidnightAI() {
    const [messages, setMessages] = React.useState<string[]>([]);

    return (
        <div className="flex flex-row text-black w-full flex-1 min-h-0 overflow-hidden">
            <Sidebar />
            <ChatWindow messages={messages} setMessages={setMessages} />
        </div>
    );
}
