import React from 'react';

export default function Dropdown({ options, currOption, onSelect, width = "w-[200px]" }: any) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const filtered = options.filter((o: any) =>
        String(o).toLowerCase().includes(search.toLowerCase())
    );

    const handleOpen = () => {
        setIsOpen(!isOpen);
        setSearch("");
    };

    return (
        <div className="dropdown relative">
            <div onClick={handleOpen} className={`text-xs flex justify-between ${width} dropdown-button bg-white text-[#000005] px-4 py-1.5 rounded-sm flex items-center cursor-pointer border-2 border-[#E0E0E0] font-semibold hover:border-[#B1B3B6] transition-colors`}>
                <div className={currOption ? "text-[#000005]" : "text-[#B1B3B6]"}>
                    {currOption || "Select Option"}
                </div>
                <img src="/dropdown.svg" className="ml-2 w-4 h-4 block" style={{ filter: 'brightness(0)' }}></img>
            </div>
            {isOpen && (
                <div className={`text-xs dropdown-menu absolute mt-1 ${width} bg-white border border-[#E0E0E0] rounded-sm shadow-lg z-10`}>
                    <div className="px-2 py-1.5 border-b border-[#E0E0E0]">
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs border border-[#E0E0E0] rounded-sm outline-none focus:border-[#B1B3B6] text-[#000005] font-semibold"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtered.length > 0 ? filtered.map((option: any) => (
                            <div
                                key={option}
                                onClick={() => {
                                    onSelect(option);
                                    setIsOpen(false);
                                    setSearch("");
                                }}
                                className="dropdown-item px-4 py-2 font-semibold text-[#000005] hover:bg-[#FFC843] hover:text-[#000005] cursor-pointer transition-colors"
                            >
                                {option}
                            </div>
                        )) : (
                            <div className="px-4 py-2 text-[#B1B3B6] font-semibold">No results</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
