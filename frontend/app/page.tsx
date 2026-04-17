'use client';
import Image from "next/image";
import Header from "@/components/Header";

import React, { useRef, useEffect } from "react";

import MidnightAI from "@/pages/MidnightAI";
import DataCollector from "@/pages/DataCollector";
import Inputter from "@/pages/Inputter";
import SignIn from "@/pages/SignIn";

export default function Home() {
  const [messages, setMessages] = React.useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userSignedIn, setUserSignedIn] = React.useState<boolean>(false);

  const [currentScreen, setCurrentScreen] = React.useState("MIDNIGHT AI");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (localStorage.getItem("username")) {
      setUserSignedIn(true);
    }
  }, [])

  return (
    <div className="flex flex-col h-screen w-full bg-[#FFFBED] font-ibm-plex-mono">
      {userSignedIn && (<Header currentScreen={currentScreen} setCurrentScreen={setCurrentScreen}/>)}

      {userSignedIn && currentScreen === "MIDNIGHT AI" ? (
        <Inputter />
      ) : (
        <DataCollector />
      )}
      {!userSignedIn && (<SignIn setUser={setUserSignedIn}/>)}
    </div>
  );
}
