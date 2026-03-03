// "use client";
// import Header from "@/components/Header";
// import { useState } from "react";
// export default function DataCollector() {
//     const [currentModule, setCurrentModule] = useState(0);

//     return (
//         <div className="flex flex-col h-screen w-full bg-[#FFFBED] font-ibm-plex-mono">
//             <Header />
//             <div className="grid grid-cols-[1fr_3fr] text-black w-full flex-1 overflow-hidden">
//                 <div className="flex flex-col items-start justify-start p-5 gap-3">
//                     <div className="text-[1.2em] font-bold">DB Modules</div>
//                     <ul className="flex flex-col gap-1 w-full">
//                         <li 
//                         className={`${currentModule == 0 ? "tab-active " : "tab-inactive"} flex items-center gap-2 w-full `}
//                         onClick={() => setCurrentModule(0)}>
//                             <span>•</span> Flute Pricing
//                         </li>
//                         <li 
//                         className={`${currentModule == 1 ? "tab-active" : "tab-inactive"} flex items-center gap-2 w-full`} 
//                         onClick={() => setCurrentModule(1)}>
//                         <span>•</span> Packaging Co
//                         </li>
//                     </ul>
//                 </div>



//                 <div className="">

//                 </div>
//             </div>
            
//         </div>
//     );
// }