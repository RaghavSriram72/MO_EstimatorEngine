import React from 'react';

export default function Dropdown({ options, currOption, onSelect }: any) { 
    const [isOpen, setIsOpen] = React.useState(false);

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className="dropdown relative">
            <div onClick={toggleDropdown} className="text-xs flex justify-between w-[200px] dropdown-button bg-[#FFFBED] text-[#ABABAB] px-4 py-1 rounded-md flex items-center cursor-pointer border-2 border-[#EDEAEA]">
                <div>
                    {currOption || "Select Option"}
                </div>
                <img src="/dropdown.svg" className="ml-2 w-5 h-5 block"></img>
            </div>
            {isOpen && (
                <div className="text-xs dropdown-menu absolute mt-2 w-[200px] bg-[#FFFBED] border-1 border-[#EDEAEA] rounded-md shadow-lg z-10">
                    {options.map((option: any, index: number) => (
                        <div
                            key={index}
                            onClick={() => {
                                onSelect(option);
                                setIsOpen(false);
                            }                     } 
                            className="dropdown-item px-4 py-2 hover:bg-[#EDEAEA] cursor-pointer"
                        >
                            {option}
                        </div>
                    ))}
                </div>  
            )}
        </div>
    );
}