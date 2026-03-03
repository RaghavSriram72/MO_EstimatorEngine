
export default function Sidebar() {
    return (
        <div className="sidebar border-1 border-[#EDEAEA]">
          <div className="RECENTCHATS p-4">
            <p className="tracking-[.15em]">RECENT</p>
            <div className="text-[#8F8F8F] flex flex-col gap-2 mt-2 pl-4">
              <p>Chat 1</p>
              <p>Chat 2</p>
              <p>Chat 3</p>
            </div>
          </div>

          <div className="PASTCHATS mt-20 p-4">
            <p className="tracking-[.15em]">PAST</p>
            <div className="text-[#8F8F8F] flex flex-col gap-2 mt-2 pl-4">
              <p>Chat 1</p>
              <p>Chat 2</p>
              <p>Chat 3</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="border-2 border-[#EDEAEA] p-4 rounded-lg cursor-pointer text-center w-3/4 mx-auto">
              New Chat
            </div>
          </div>
        </div>
    );
}