export default function Alert({ message, code, visible }: { message: string, code: number, visible: boolean }) {
    return (
        
        <div className={
            `${visible ? "show-alert": "hide-alert"} 
            ${ code == 0 ?  "bg-green-500" : "bg-red-500"} 
            fixed top-[40px] right-[40px] text-white px-4 py-2 rounded-md shadow-md z-50`}>
            
            {message}
        </div>
    );
}