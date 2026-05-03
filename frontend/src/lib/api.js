import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export function setAuthToken(token) {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        localStorage.setItem("kindred_token", token);
    } else {
        delete api.defaults.headers.common.Authorization;
        localStorage.removeItem("kindred_token");
    }
}

const stored = localStorage.getItem("kindred_token");
if (stored) {
    api.defaults.headers.common.Authorization = `Bearer ${stored}`;
}

export function formatAUD(n) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
    }).format(n || 0);
}

export function formatAUD2(n) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
    }).format(n || 0);
}
