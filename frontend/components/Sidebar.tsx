"use client";

const CONVERSATIONS = [
    { name: "Standee quote — retail campaign", date: "Today", active: true },
    { name: "Complex 18-unit estimate", date: "Yesterday", active: false },
    { name: "Foster pricing check", date: "Jun 28", active: false },
];

const IconChat = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
);

export default function Sidebar() {
    return (
        <aside className="shrink-0 w-[260px] flex flex-col border-r-2 border-[#E0E0E0] bg-white px-3 py-5 gap-3">
            <div className="flex flex-col gap-0.5 pl-3">
                <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#B1B3B6]">// Midnight AI</span>
                <span className="text-[1.25em] font-bold text-[#000005]">Conversations</span>
            </div>

            <button
                type="button"
                className="text-[10px] font-black text-center uppercase tracking-widest py-2.5 rounded-sm border-2 border-[#000005] bg-[#000005] text-white hover:bg-[#FFC843] hover:border-[#FFC843] hover:text-[#000005] transition-all duration-200"
            >
                + NEW CHAT
            </button>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#B1B3B6] px-1 mt-1 mb-0.5">
                    Recent
                </div>
                {CONVERSATIONS.map((c, i) => (
                    <div
                        key={i}
                        className={`flex items-stretch rounded-md border transition-all duration-200 overflow-hidden cursor-pointer ${
                            c.active
                                ? "border-[#FFC843] bg-[#FFFBEE] shadow-sm"
                                : "border-[#E8E8E8] bg-white hover:border-[#C8C8C8] hover:shadow-sm"
                        }`}
                    >
                        <div className={`w-[3px] shrink-0 transition-all duration-200 ${c.active ? "bg-[#FFC843]" : "bg-transparent"}`} />
                        <div className="flex items-start gap-2 px-2.5 py-2.5 min-w-0">
                            <span className={`mt-0.5 shrink-0 ${c.active ? "text-[#FFC843]" : "text-[#DEDEDE]"}`}>
                                <IconChat />
                            </span>
                            <div className="min-w-0">
                                <div className="text-[12px] font-bold text-[#000005] tracking-tight line-clamp-2 leading-tight">
                                    {c.name}
                                </div>
                                <div className="text-[9px] text-[#B1B3B6] font-semibold mt-0.5 uppercase tracking-wider">
                                    {c.date}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}