'use client';
import Image from "next/image";
import Header from "@/components/Header";

import React, { useRef, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";

export default function MidnightAI() {
  const [messages, setMessages] = React.useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (

    <div className="grid grid-cols-[1fr_6fr] text-black w-full flex-1 overflow-hidden">
    <Sidebar />
    <ChatWindow messages={messages} setMessages={setMessages} />
        


    </div>
      
  );
}
