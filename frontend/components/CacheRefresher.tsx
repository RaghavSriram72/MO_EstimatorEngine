"use client";
import { useEffect } from "react";
import { API_BASE } from "@/lib/config";

export default function CacheRefresher() {
    useEffect(() => {
        fetch(`${API_BASE}/refresh-cache`, { method: "POST" }).catch(console.error);
    }, []);
    return null;
}
