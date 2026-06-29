"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/Alert";
import { API_BASE } from "@/lib/config";

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

export default function SignUp() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
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

    function handleCreateAccount() {
        if (!username || !password || !confirmPassword) { triggerAlert("Please fill all fields", 1); return; }
        if (password !== confirmPassword) { triggerAlert("Passwords do not match!", 1); return; }
        fetch(`${API_BASE}/create-account`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        }).then((response) => {
            if (response.ok) {
                triggerAlert("Account created! Please sign in.", 0);
                setTimeout(() => router.push("/sign-in"), ALERT_DURATION_MS + 800);
            } else {
                triggerAlert("Error creating account. Please try again.", 1);
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
                        <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// NEW USER</div>
                        <h2 className="text-3xl font-black text-[#000005] uppercase tracking-tight">Create Account</h2>
                        <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">Set up your estimator workspace account</p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); handleCreateAccount(); }}>
                        <div className="mb-4">
                            <label htmlFor="signup-username" className={labelCls}>Username</label>
                            <input type="text" id="signup-username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
                        </div>
                        <div className="mb-4">
                            <label htmlFor="signup-password" className={labelCls}>Password</label>
                            <div className="relative">
                                <input type={showPassword ? "text" : "password"} id="signup-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " pr-10"} />
                                <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B1B3B6] hover:text-[#000005] transition-colors">
                                    <EyeIcon show={showPassword} />
                                </button>
                            </div>
                        </div>
                        <div className="mb-4">
                            <label htmlFor="signup-confirm" className={labelCls}>Confirm Password</label>
                            <div className="relative">
                                <input type={showConfirm ? "text" : "password"} id="signup-confirm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls + " pr-10"} />
                                <button type="button" onClick={() => setShowConfirm((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B1B3B6] hover:text-[#000005] transition-colors">
                                    <EyeIcon show={showConfirm} />
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-row justify-between items-center mt-6">
                            <button type="submit" className="bg-[#FFC843] hover:bg-[#000005] hover:text-white text-[#000005] font-black py-2 px-6 rounded-sm text-sm uppercase tracking-wider transition-all duration-200">
                                Create Account
                            </button>
                            <button type="button" onClick={() => router.push("/sign-in")} className="ml-4 text-[#B1B3B6] hover:text-[#000005] cursor-pointer text-xs font-bold uppercase tracking-wider transition-all duration-200">
                                Back to sign in
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
