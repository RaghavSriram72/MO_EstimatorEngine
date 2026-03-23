import { useEffect, useRef } from "react";
import Chatbox from "./Chatbox";

export default function ChatWindow({ messages, setMessages }: any) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

    return (
        <div className="border-1 border-[#cecece] grid h-full min-h-0 grid-rows-[4fr_200px]">
          <div className="relative h-full min-h-0 overflow-hidden">
            <div className="h-full min-h-0 flex flex-col p-5 gap-3 overflow-y-auto">
            {messages.map((msg: string, index: number) => (
              <div key={index} className={`w-full flex ${index % 2 === 0 ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`max-w-[60%] px-4 py-2 rounded-lg ${index % 2 === 0 ? 'bg-[#FFB604] text-white' : 'bg-[#EDEAEA] text-black'}`}>
                  {msg}
                </div>
              </div>  
            ))}
            <div ref={messagesEndRef} />

            </div>
            <div className={`${messages.length > 0 ? 'chat-intro-active' : 'chat-intro-inactive'} absolute inset-0 flex justify-center items-center flex-col gap-2 pointer-events-none`}>
              <div className="font-instrument text-[3em]">Midnight <span className="italic text-[#FFB604]">AI</span> </div>
              <div className="ml-2 text-center">Live pricing data and intelligent quote <br/> generation — at your fingertips.</div>
            </div>
          </div>
          <Chatbox messages={messages} setMessages={setMessages} />
        </div>
    )
}