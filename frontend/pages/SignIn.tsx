"use client";

import { useState } from "react";
import Alert from "@/components/Alert";

export default function SignIn({setUser}: any) {
    const ALERT_DURATION_MS = 3100;
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

        fetch("http://localhost:8000/create-account", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: newUsername,
                password: newPassword,
            }),
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
        fetch("http://localhost:8000/sign-in", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username,
                password,
            }),
        })
        .then((response) => {
            if (response.ok) {
                triggerAlert("Sign-in successful!", 0);
                localStorage.setItem("username", username);
                setTimeout(() => setUser(true), ALERT_DURATION_MS);
            }
            else {
                triggerAlert("Invalid username or password", 1);
            }
        })
    }
    return (
        <div className="flex flex-col h-screen bg-[#FFFBED] text-black">
            <Alert message={alertMessage} code={alertCode} visible={showAlert} />
        
            <div>
                <div className="header border-b-2 border-[#EDEAEA] flex flex-row justify-start items-center p-3">
                    <img src="/MOA_logo.svg" alt="MOA logo" width={200} height={50} />
                </div>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 px-4">
                <div className="relative w-full max-w-md min-h-[500px]">
                    <div className={`absolute inset-0 w-full bg-white border-2 border-[#EDEAEA] p-8 rounded-xl transition-all duration-300 ease-in-out ${currentScreen === 0 ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-6 pointer-events-none"}`}>
                        <h2 className="text-[2.5em] font-instrument mb-1">Sign <span className="italic text-[#FFB604]">In</span></h2>
                        <p className="text-xs text-[#ABABAB] mb-6">Access your estimator workspace</p>

                        <form onSubmit={(event) =>{ event.preventDefault(); handleSignIn(); }}>
                            <div className="mb-4">
                                <label htmlFor="signin-username" className="block text-[#363535] font-medium mb-2 text-sm">Username</label>
                                <input
                                    type="text"
                                    id="signin-username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="border-2 w-full border-[#EDEAEA] rounded-md py-2 px-3 bg-[#FFFBED] focus:outline-none focus:border-[#FFB604]"
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="signin-password" className="block text-[#363535] font-medium mb-2 text-sm">Password</label>
                                <input
                                    type="password"
                                    id="signin-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="border-2 w-full border-[#EDEAEA] rounded-md py-2 px-3 bg-[#FFFBED] focus:outline-none focus:border-[#FFB604]"
                                />
                            </div>
                            <div className="flex flex-row justify-between items-center mt-6">
                                <button
                                    type="submit"
                                    className="bg-[#FFB604] hover:text-white text-black font-bold py-2 px-5 rounded-md transition-all duration-250 ease-in-out"
                                
                                    
                                >
                                    Sign In
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentScreen(1)}
                                    className="ml-4 text-[#ABABAB] hover:text-black cursor-pointer text-sm transition-all duration-250 ease-in-out"
                                >
                                    Create an account?
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className={`absolute inset-0 w-full bg-white border-2 border-[#EDEAEA] p-8 rounded-xl transition-all duration-300 ease-in-out ${currentScreen === 1 ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-6 pointer-events-none"}`}>
                        <h2 className="text-[2.5em] font-instrument mb-1">Create <span className="italic text-[#FFB604]">Account</span></h2>
                        <p className="text-xs text-[#ABABAB] mb-6">Set up your estimator workspace account</p>

                        <form onSubmit={(event) => {
                            event.preventDefault();
                            handleCreateAccount();
                        }}>
                            <div className="mb-4">
                                <label htmlFor="signup-username" className="block text-[#363535] font-medium mb-2 text-sm">Username</label>
                                <input
                                    type="text"
                                    id="signup-username"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="border-2 w-full border-[#EDEAEA] rounded-md py-2 px-3 bg-[#FFFBED] focus:outline-none focus:border-[#FFB604]"
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="signup-password" className="block text-[#363535] font-medium mb-2 text-sm">Password</label>
                                <input
                                    type="password"
                                    id="signup-password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="border-2 w-full border-[#EDEAEA] rounded-md py-2 px-3 bg-[#FFFBED] focus:outline-none focus:border-[#FFB604]"
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="signup-confirm-password" className="block text-[#363535] font-medium mb-2 text-sm">Confirm Password</label>
                                <input
                                    type="password"
                                    id="signup-confirm-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="border-2 w-full border-[#EDEAEA] rounded-md py-2 px-3 bg-[#FFFBED] focus:outline-none focus:border-[#FFB604]"
                                />
                            </div>
                            <div className="flex flex-row justify-between items-center mt-6">
                                <button
                                    type="submit"
                                    className="bg-[#FFB604] hover:text-white text-black font-bold py-2 px-5 rounded-md transition-all duration-250 ease-in-out"
                                >
                                    Create Account
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentScreen(0)}
                                    className="ml-4 text-[#ABABAB] hover:text-black cursor-pointer text-sm transition-all duration-250 ease-in-out"
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