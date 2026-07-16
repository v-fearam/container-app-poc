import { useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { runtimeConfig } from '../runtimeConfig';

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`API error ${status}: ${body}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const baseUrl = (runtimeConfig.apiUrl || import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Attempts to refresh the Easy Auth session token via /.auth/refresh.
 * Returns true if refresh succeeded, false otherwise.
 */
async function refreshEasyAuthToken(): Promise<boolean> {
  try {
    const res = await fetch('/.auth/refresh');
    return res.ok;
  } catch {
    return false;
  }
}

export function useApi() {
  const { accessToken, refreshAuthInfo } = useAuth();
  const isRefreshing = useRef(false);

  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit): Promise<Response> => {
      const res = await fetch(url, options);

      // If 401 and we have a token, try refreshing once
      if (res.status === 401 && accessToken && !isRefreshing.current) {
        isRefreshing.current = true;
        const refreshed = await refreshEasyAuthToken();
        isRefreshing.current = false;

        if (refreshed) {
          await refreshAuthInfo();
          window.location.reload();
          return res;
        } else {
          // Refresh failed — redirect to login
          window.location.href = '/.auth/login/entraid';
          return res;
        }
      }

      return res;
    },
    [accessToken, refreshAuthInfo],
  );

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      if (!baseUrl) {
        throw new ApiError(0, 'API URL no configurada. Define API_URL (runtime) o VITE_API_URL (build).');
      }

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetchWithRetry(`${baseUrl}${path}`, {
        headers,
        credentials: 'include',
      });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }

      return res.json() as Promise<T>;
    },
    [accessToken, fetchWithRetry],
  );

  const post = useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      if (!baseUrl) {
        throw new ApiError(0, 'API URL no configurada. Define API_URL (runtime) o VITE_API_URL (build).');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetchWithRetry(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }

      // Handle empty response (204 No Content)
      const contentType = res.headers.get('content-type');
      if (res.status === 204 || !contentType?.includes('application/json')) {
        return undefined as T;
      }

      return res.json() as Promise<T>;
    },
    [accessToken, fetchWithRetry],
  );

  const put = useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      if (!baseUrl) {
        throw new ApiError(0, 'API URL no configurada. Define API_URL (runtime) o VITE_API_URL (build).');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetchWithRetry(`${baseUrl}${path}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }

      // Handle empty response (204 No Content)
      const contentType = res.headers.get('content-type');
      if (res.status === 204 || !contentType?.includes('application/json')) {
        return undefined as T;
      }

      return res.json() as Promise<T>;
    },
    [accessToken, fetchWithRetry],
  );

  const del = useCallback(
    async <T = void>(path: string): Promise<T> => {
      if (!baseUrl) {
        throw new ApiError(0, 'API URL no configurada. Define API_URL (runtime) o VITE_API_URL (build).');
      }

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetchWithRetry(`${baseUrl}${path}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }

      // Handle empty response (204 No Content)
      const contentType = res.headers.get('content-type');
      if (res.status === 204 || !contentType?.includes('application/json')) {
        return undefined as T;
      }

      return res.json() as Promise<T>;
    },
    [accessToken, fetchWithRetry],
  );

  return { get, post, put, del, baseUrl };
}