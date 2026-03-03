'use client';
import Image from "next/image";
import Header from "@/components/Header";

import React, { useRef, useEffect } from "react";

import MidnightAI from "@/pages/MidnightAI";
import DataCollector from "@/pages/DataCollector";

export default function Home() {
  const [messages, setMessages] = React.useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentScreen, setCurrentScreen] = React.useState("MIDNIGHT AI");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#FFFBED] font-ibm-plex-mono">
      <Header currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} />

      {currentScreen === "MIDNIGHT AI" ? (
        <MidnightAI />
      ) : (
        <DataCollector />
      )}

    </div>
  );
}
