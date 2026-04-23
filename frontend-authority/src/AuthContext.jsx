import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [auth, setAuth] = useState(() => {
        try {
            const saved = sessionStorage.getItem("auth");
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });

    const login = (data) => {
        sessionStorage.setItem("auth", JSON.stringify(data));
        setAuth(data);
    };

    const logout = () => {
        sessionStorage.removeItem("auth");
        setAuth(null);
    };

    return (
        <AuthContext.Provider value={{ auth, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);