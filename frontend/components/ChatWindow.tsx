import Chatbox from "./Chatbox";

export default function ChatWindow({ messages, setMessages }: any) {

    return (
        <div className="border-1 border-[#cecece] grid grid-rows-[4fr_200px]">
          <div className="flex justify-center items-center flex-col gap-2">
            <div className="font-instrument text-[3em]">Midnight <span className="italic text-[#FFB604]">AI</span> </div>
            <div className="ml-2 text-center">Live pricing data and intelligent quote <br/> generation — at your fingertips.</div>
          </div>
          <Chatbox messages={messages} setMessages={setMessages} />
        </div>
    )
}