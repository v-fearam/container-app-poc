import { useCallback } from 'react';
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

export function useApi() {
  const { accessToken } = useAuth();

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      if (!baseUrl) {
        throw new ApiError(0, 'API URL no configurada. Define API_URL (runtime) o VITE_API_URL (build).');
      }

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch(`${baseUrl}${path}`, {
        headers,
        credentials: 'include',
      });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }

      return res.json() as Promise<T>;
    },
    [accessToken],
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

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }

      return res.json() as Promise<T>;
    },
    [accessToken],
  );

  return { get, post, baseUrl };
}
