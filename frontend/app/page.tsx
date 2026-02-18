'use client';
import Image from "next/image";
import Header from "@/components/Header";
import Chatbox from "@/components/Chatbox";
import React, { useRef, useEffect } from "react";

export default function Home() {
  const [messages, setMessages] = React.useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <Header />
      <div className="flex flex-col overflow-y-auto max-h-96 px-4">
        {messages.map((message, index) => (
          <div 
            key={index} 
            className={`flex ${index % 2 === 0 ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`message p-4 m-2 text-black ${index % 2 === 0 ? 'bg-white' : 'bg-blue-100'} rounded-lg shadow max-w-xs`}>
              {message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <Chatbox messages={messages} setMessages={setMessages} />
    </div>
  );
}
