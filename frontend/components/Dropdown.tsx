import React from 'react';

export default function Dropdown({ options, currOption, onSelect, width = "w-[200px]" }: any) {
    const [isOpen, setIsOpen] = React.useState(false);

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className="dropdown relative">
            <div onClick={toggleDropdown} className={`text-xs flex justify-between ${width} dropdown-button bg-white text-[#000005] px-4 py-1.5 rounded-sm flex items-center cursor-pointer border-2 border-[#E0E0E0] font-semibold hover:border-[#B1B3B6] transition-colors`}>
                <div className={currOption ? "text-[#000005]" : "text-[#B1B3B6]"}>
                    {currOption || "Select Option"}
                </div>
                <img src="/dropdown.svg" className="ml-2 w-4 h-4 block" style={{ filter: 'brightness(0)' }}></img>
            </div>
            {isOpen && (
                <div className={`text-xs dropdown-menu absolute mt-1 ${width} max-h-50 overflow-y-auto bg-white border border-[#E0E0E0] rounded-sm shadow-lg z-10`}>
                    {options.map((option: any) => (
                        <div
                            key={option}
                            onClick={() => {
                                onSelect(option);
                                setIsOpen(false);
                            }}
                            className="dropdown-item px-4 py-2 font-semibold text-[#000005] hover:bg-[#FFC843] hover:text-[#000005] cursor-pointer transition-colors"
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
