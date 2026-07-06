import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { appInsights } from '../appInsights';

export interface AuthUser {
  name: string;
  email: string;
  userId: string;
  roles: string[];
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuthInfo();
  }, []);

  const fetchAuthInfo = async () => {
    try {
      const response = await fetch('/_authinfo');

      if (response.ok) {
        const data = await response.json();

        if (data.authenticated && data.clientPrincipal) {
          try {
            const decoded = JSON.parse(atob(data.clientPrincipal));
            const claims: { typ: string; val: string }[] = decoded.claims || [];
            const getClaim = (type: string) =>
              claims.find((c) => c.typ === type)?.val;

            setUser({
              name: getClaim('name') || getClaim('preferred_username') || data.userName || decoded.userDetails || 'Usuario',
              email: getClaim('email') || getClaim('preferred_username') || data.userName || '',
              userId: data.userId || decoded.userId || '',
              roles: claims
                .filter((c) => c.typ === 'roles' || c.typ === 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role')
                .map((c) => c.val),
            });

            if (data.accessToken) {
              setAccessToken(data.accessToken);
            }

            appInsights.trackEvent({
              name: 'UserInfoFetched',
              properties: { isAuthenticated: true, provider: data.identityProvider },
            });
          } catch {
            setUser({
              name: data.userName || 'Usuario autenticado',
              email: data.userName || '',
              userId: data.userId || '',
              roles: [],
            });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching auth info:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    window.location.href = '/.auth/login/entraid';
  };

  const logout = () => {
    window.location.href = '/.auth/logout';
  };

  const value: AuthContextValue = {
    isAuthenticated: user !== null,
    user,
    accessToken,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
