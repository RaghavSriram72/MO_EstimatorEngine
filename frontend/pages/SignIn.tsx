"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/Alert";
import { API_BASE } from "@/lib/config";
import { useAuth } from "@/contexts/AuthContext";

const ALERT_DURATION_MS = 1500;

const inputCls = "border-2 w-full border-[#E0E0E0] rounded-sm py-2 px-3 bg-[#F8F8F8] focus:outline-none focus:border-[#FFC843] text-[#000005] font-semibold text-sm transition-colors";
const labelCls = "block text-[#000005] font-bold mb-2 text-xs uppercase tracking-wider";

const EyeIcon = ({ show }: { show: boolean }) => show ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
);

export default function SignIn() {
    const router = useRouter();
    const { signIn } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertCode, setAlertCode] = useState(0);
    const [showAlert, setShowAlert] = useState(false);

    function triggerAlert(message: string, code: number) {
        setShowAlert(false);
        setAlertMessage(message);
        setAlertCode(code);
        setTimeout(() => setShowAlert(true), 10);
        setTimeout(() => setShowAlert(false), ALERT_DURATION_MS);
    }

    function handleSignIn() {
        if (!username || !password) { triggerAlert("Please fill fields", 1); return; }
        fetch(`${API_BASE}/sign-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        }).then(async (response) => {
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                triggerAlert("Sign-in successful!", 0);
                signIn(username, data.role === "admin" ? "admin" : "user");
                setTimeout(() => router.push("/quoteEngine"), ALERT_DURATION_MS + 800);
            } else {
                triggerAlert("Invalid username or password", 1);
            }
        });
    }

    return (
        <div className="flex flex-col h-screen bg-white text-[#000005]">
            <Alert message={alertMessage} code={alertCode} visible={showAlert} />
            <div className="header border-b-2 border-[#E0E0E0] flex flex-row justify-start items-center p-3 bg-white">
                <img src="/MOA_logo.svg" alt="MOA logo" width={200} height={50} />
            </div>
            <div className="flex flex-col items-center justify-center flex-1 px-4 bg-[#F8F8F8]">
                <div className="w-full max-w-md bg-white border-2 border-[#E0E0E0] p-8 rounded-sm">
                    <div className="mb-6">
                        <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// ACCESS</div>
                        <h2 className="text-3xl font-black text-[#000005] uppercase tracking-tight">Sign In</h2>
                        <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">Access your estimator workspace</p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); handleSignIn(); }}>
                        <div className="mb-4">
                            <label htmlFor="signin-username" className={labelCls}>Username</label>
                            <input type="text" id="signin-username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
                        </div>
                        <div className="mb-4">
                            <label htmlFor="signin-password" className={labelCls}>Password</label>
                            <div className="relative">
                                <input type={showPassword ? "text" : "password"} id="signin-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " pr-10"} />
                                <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B1B3B6] hover:text-[#000005] transition-colors">
                                    <EyeIcon show={showPassword} />
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-row justify-between items-center mt-6">
                            <button type="submit" className="bg-[#FFC843] hover:bg-[#000005] hover:text-white text-[#000005] font-black py-2 px-6 rounded-sm text-sm uppercase tracking-wider transition-all duration-200">
                                Sign In
                            </button>
                            <button type="button" onClick={() => router.push("/sign-up")} className="ml-4 text-[#B1B3B6] hover:text-[#000005] cursor-pointer text-xs font-bold uppercase tracking-wider transition-all duration-200">
                                Create an account?
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
