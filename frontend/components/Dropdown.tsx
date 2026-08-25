import React from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ options, currOption, onSelect, width = "w-full", placeholder }: any) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; width: number } | null>(null);
    const triggerRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (!placeholder && !currOption && options.length > 0) {
            onSelect(options[0]);
        }
    }, [options]);

    // Focus the search box without letting the browser scroll the nearest scrollable
    // ancestor (e.g. the Elements list) to bring it into view — that's what caused the
    // page to jump whenever this dropdown opened inside a scrollable container.
    React.useEffect(() => {
        if (isOpen) searchInputRef.current?.focus({ preventScroll: true });
    }, [isOpen]);

    // The menu is rendered in a portal straight into <body> (below) so it escapes any
    // scrollable/overflow-hidden ancestor instead of being clipped by it — z-index alone
    // can't fix that, since clipping happens before stacking order is even considered.
    // Position is tracked in fixed viewport coordinates and kept in sync with the trigger
    // while open, since a portaled element no longer moves automatically when an ancestor
    // (e.g. the Elements list) scrolls.
    const updateMenuPos = React.useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }, []);

    React.useEffect(() => {
        if (!isOpen) return;
        updateMenuPos();
        window.addEventListener("scroll", updateMenuPos, true);
        window.addEventListener("resize", updateMenuPos);
        return () => {
            window.removeEventListener("scroll", updateMenuPos, true);
            window.removeEventListener("resize", updateMenuPos);
        };
    }, [isOpen, updateMenuPos]);

    const filtered = options.filter((o: any) =>
        String(o).toLowerCase().includes(search.toLowerCase())
    );

    const handleOpen = () => {
        setIsOpen(!isOpen);
        setSearch("");
    };

    return (
        <div className="dropdown relative w-full min-w-0">
            <div
                ref={triggerRef}
                onClick={handleOpen}
                className={`text-xs flex justify-between items-center gap-2 min-w-0 ${width} dropdown-button bg-white text-[#000005] px-3 py-1.5 rounded-sm cursor-pointer border-2 border-[#E0E0E0] font-semibold hover:border-[#B1B3B6] transition-colors`}
            >
                <div className={`min-w-0 flex-1 truncate ${currOption ? "text-[#000005]" : "text-[#B1B3B6]"}`}>
                    {currOption || placeholder || "Select Option"}
                </div>
                <img src="/dropdown.svg" className="ml-2 w-4 h-4 shrink-0 block" style={{ filter: 'brightness(0)' }}></img>
            </div>
            {isOpen && menuPos && typeof document !== "undefined" && createPortal(
                <div
                    className="text-xs dropdown-menu bg-white border border-[#E0E0E0] rounded-sm shadow-lg"
                    style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 9999 }}
                >
                    <div className="px-2 py-1.5 border-b border-[#E0E0E0]">
                        <input
                            ref={searchInputRef}
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
                </div>,
                document.body
            )}
        </div>
    );
}
