import { useEffect, useRef } from "react";
import Chatbox from "./Chatbox";

export default function ChatWindow({ messages, setMessages }: any) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

    return (
        <div className="border border-[#E0E0E0] grid h-full min-h-0 grid-rows-[4fr_200px]">
          <div className="relative h-full min-h-0 overflow-hidden">
            <div className="h-full min-h-0 flex flex-col p-5 gap-3 overflow-y-auto">
            {messages.map((msg: string, index: number) => (
              <div key={index} className={`w-full flex ${index % 2 === 0 ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`max-w-[60%] px-4 py-2 rounded-sm text-sm font-semibold ${index % 2 === 0 ? 'bg-[#000005] text-white' : 'bg-[#F4F4F4] text-[#000005]'}`}>
                  {msg}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />

            </div>
            <div className={`${messages.length > 0 ? 'chat-intro-active' : 'chat-intro-inactive'} absolute inset-0 flex justify-center items-center flex-col gap-2 pointer-events-none`}>
              <div className="text-[2.5em] font-black tracking-tight text-[#000005] uppercase">
                <span className="text-[#FFC843]">// </span>MIDNIGHT AI
              </div>
              <div className="text-sm text-[#B1B3B6] text-center font-semibold">
                Live pricing data and intelligent quote<br/>generation — at your fingertips.
              </div>
            </div>
          </div>
          <Chatbox messages={messages} setMessages={setMessages} />
        </div>
    )
}
