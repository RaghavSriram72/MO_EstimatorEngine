"use client";

import { useState } from "react";
import Alert from "@/components/Alert";
import { API_BASE } from "@/lib/config";

export default function SignIn({setUser}: any) {
    const ALERT_DURATION_MS = 1500;
    const [currentScreen, setCurrentScreen] = useState(0);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

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
        if (newPassword !== confirmPassword) {
            triggerAlert("Passwords do not match!", 1);
            return;
        }

        if (newUsername == "" || newPassword == "" || confirmPassword == "") {
            triggerAlert("Please fill all fields", 1);
            return;
        }

        fetch(`${API_BASE}/create-account`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: newUsername, password: newPassword }),
        })
        .then((response) => {
            if (response.ok) {
                triggerAlert("Account created successfully! Please sign in.", 0);
                setCurrentScreen(0);
            } else {
                triggerAlert("Error creating account. Please try again.", 1);
            }
        })
    }

    function handleSignIn() {
        if (username.length === 0 || password.length === 0) {
            triggerAlert("Please fill fields", 1);
            return;
        }
        fetch(`${API_BASE}/sign-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        })
        .then((response) => {
            if (response.ok) {
                triggerAlert("Sign-in successful!", 0);
                localStorage.setItem("username", username);
                setTimeout(() => setUser(true), ALERT_DURATION_MS + 800);
            } else {
                triggerAlert("Invalid username or password", 1);
            }
        })
    }

    const inputCls = "border-2 w-full border-[#E0E0E0] rounded-sm py-2 px-3 bg-[#F8F8F8] focus:outline-none focus:border-[#FFC843] text-[#000005] font-semibold text-sm transition-colors";
    const labelCls = "block text-[#000005] font-bold mb-2 text-xs uppercase tracking-wider";

    return (
        <div className="flex flex-col h-screen bg-white text-[#000005]">
            <Alert message={alertMessage} code={alertCode} visible={showAlert} />

            <div>
                <div className="header border-b-2 border-[#E0E0E0] flex flex-row justify-start items-center p-3 bg-white">
                    <img src="/MOA_logo.svg" alt="MOA logo" width={200} height={50} />
                </div>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 px-4 bg-[#F8F8F8]">
                <div className="relative w-full max-w-md min-h-[480px]">

                    {/* Sign In panel */}
                    <div className={`absolute inset-0 w-full bg-white border-2 border-[#E0E0E0] p-8 rounded-sm transition-all duration-300 ease-in-out ${currentScreen === 0 ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-6 pointer-events-none"}`}>
                        <div className="mb-6">
                            <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// ACCESS</div>
                            <h2 className="text-3xl font-black text-[#000005] uppercase tracking-tight">Sign In</h2>
                            <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">Access your estimator workspace</p>
                        </div>

                        <form onSubmit={(event) => { event.preventDefault(); handleSignIn(); }}>
                            <div className="mb-4">
                                <label htmlFor="signin-username" className={labelCls}>Username</label>
                                <input
                                    type="text"
                                    id="signin-username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="signin-password" className={labelCls}>Password</label>
                                <input
                                    type="password"
                                    id="signin-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div className="flex flex-row justify-between items-center mt-6">
                                <button
                                    type="submit"
                                    className="bg-[#FFC843] hover:bg-[#000005] hover:text-white text-[#000005] font-black py-2 px-6 rounded-sm text-sm uppercase tracking-wider transition-all duration-200"
                                >
                                    Sign In
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentScreen(1)}
                                    className="ml-4 text-[#B1B3B6] hover:text-[#000005] cursor-pointer text-xs font-bold uppercase tracking-wider transition-all duration-200"
                                >
                                    Create an account?
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Create Account panel */}
                    <div className={`absolute inset-0 w-full bg-white border-2 border-[#E0E0E0] p-8 rounded-sm transition-all duration-300 ease-in-out ${currentScreen === 1 ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-6 pointer-events-none"}`}>
                        <div className="mb-6">
                            <div className="text-xs font-bold text-[#FFC843] tracking-widest uppercase mb-1">// NEW USER</div>
                            <h2 className="text-3xl font-black text-[#000005] uppercase tracking-tight">Create Account</h2>
                            <p className="text-xs text-[#B1B3B6] mt-1 font-semibold">Set up your estimator workspace account</p>
                        </div>

                        <form onSubmit={(event) => { event.preventDefault(); handleCreateAccount(); }}>
                            <div className="mb-4">
                                <label htmlFor="signup-username" className={labelCls}>Username</label>
                                <input
                                    type="text"
                                    id="signup-username"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="signup-password" className={labelCls}>Password</label>
                                <input
                                    type="password"
                                    id="signup-password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="signup-confirm-password" className={labelCls}>Confirm Password</label>
                                <input
                                    type="password"
                                    id="signup-confirm-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div className="flex flex-row justify-between items-center mt-6">
                                <button
                                    type="submit"
                                    className="bg-[#FFC843] hover:bg-[#000005] hover:text-white text-[#000005] font-black py-2 px-6 rounded-sm text-sm uppercase tracking-wider transition-all duration-200"
                                >
                                    Create Account
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentScreen(0)}
                                    className="ml-4 text-[#B1B3B6] hover:text-[#000005] cursor-pointer text-xs font-bold uppercase tracking-wider transition-all duration-200"
                                >
                                    Back to sign in
                                </button>
                            </div>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    );
}
