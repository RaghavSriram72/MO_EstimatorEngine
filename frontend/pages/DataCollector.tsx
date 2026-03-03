"use client";
import Header from "@/components/Header";
import Dropdown from "@/components/Dropdown";
import { useState } from "react";
export default function DataCollector() {
    const [currentModule, setCurrentModule] = useState(0);
    const [currentFluteType, setCurrentFluteType] = useState("");

    return (
            <div className="grid grid-cols-[2fr_5fr_1fr] text-black w-full flex-1 overflow-hidden">
                <div className="flex flex-col items-start justify-start pl-10 p-5 gap-3">
                    <div className="text-[1.2em] font-bold">DB Modules</div>
                    <ul className="flex flex-col gap-4 w-full">
                        <li 
                        className={`${currentModule == 0 ? "tab-active " : "tab-inactive"} flex items-center gap-5 w-full `}
                        onClick={() => setCurrentModule(0)}>
                            <span>•</span> Flute Pricing
                        </li>
                        <li 
                        className={`${currentModule == 1 ? "tab-active" : "tab-inactive"} flex items-center gap-5 w-full`} 
                        onClick={() => setCurrentModule(1)}>
                        <span>•</span> Packaging Co
                        </li>
                    </ul>
                </div>



                <div className="flex flex-col ml-5 p-1 justify-start items-start  ">
                    <div className="ml-15 pb-3">
                        <div className="text-[2.5em]  font-instrument">Update <span className="italic text-[#FFB604]">Flute</span> Pricing</div>
                        <p className="text-xs">Modify Live Data for Flute Pricing Module</p>
                    </div>
                   

                    <div className="flex flex-col w-[50vw] h-[74vh] border-2 bg-white border-[#EDEAEA] rounded-xl text-[#ABABAB]">
                        {/* SECTION 1 */}
                        <div className="flex flex-col justify-center items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">01 - RECORD SELECTION</div>
                            <div className="w-full">
                                <div className="text-xs font-bold m-2">Flute Type</div>
                                    <Dropdown options={["Type A", "Type B", "Type C"]} currOption={currentFluteType} onSelect={setCurrentFluteType} />
                            </div>
                        </div>
                        {/* SECTION 2 */}
                        <div className="flex flex-col justify-evenly items-start w-full p-5 border-b-2 border-[#EDEAEA]">
                            <div className="text-[10px] m-2">02 - CURRENT VALUES</div>
                            <div className="w-full flex flex-row gap-5">
                                <div className="flex flex-col justify-center items-start p-3 border-2 flex-1 h-[100px] bg-[#FFF3C2] border-[#FFB604] rounded-md">
                                    <div className="text-xs">E FLUTE - LIVE PRICE</div>
                                    <div className="text-[#FFB604] text-[2.8em] font-instrument">$10.00</div>
                                </div>
                                <div className="flex flex-col justify-center items-start p-3 border-2 flex-1 h-[100px] border-[#EDEAEA] rounded-md">
                                    <div className="text-xs">LAST UPDATED</div>
                                    <div className="text-[#ABABAB] text-[2.2em] font-instrument">10/10/2024</div>
                                    <div className="text-xs">By Bob</div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 3 */}
                        <div className="flex flex-col justify-between items-start w-full flex-1 p-5 ">
                            <div className="text-[10px] m-2">03 - UPDATE VALUES</div>
                            <div className="flex flex-row gap-5 items-center w-full">
                                <div className="flex-1">
                                    <div className="text-xs font-bold m-2">New Price</div>
                                    <input type="text" className="border-2 border-[#EDEAEA] rounded-md w-full p-1 outline-none" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs font-bold m-2">Reason For Change</div>
                                    <input type="text" className="border-2 border-[#EDEAEA] rounded-md w-full p-1 outline-none" />
                                </div>
                                
                                    
                            </div>
                            <div className="flex w-full flex-row justify-end items-center p-5 gap-10">
                                <div className="text-s text-center font-bold m-2 text-[#ABABAB] border-2 border-[#EDEAEA] p-2 rounded-md w-[150px] cursor-pointer">CLEAR</div>
                                <div className="flex flex-row gap-5 text-s font-bold m-2 bg-[#FFB604] text-black hover:text-white hover:[&_img]:invert px-4 py-2 rounded-md cursor-pointer transition-all duration-250 ease-in-out [&_img]:transition-all [&_img]:duration-250 [&_img]:ease-in-out">
                                    SUBMIT UPDATE <img src="/submitarrow.svg" alt="" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    );
}