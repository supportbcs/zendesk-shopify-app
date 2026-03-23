import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useAuthFetch() {
  const { user, logout } = useAuth();

  return useCallback(async (url, options = {}) => {
    if (!user) throw new Error('Not authenticated');

    const idToken = await user.getIdToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: 'Bearer ' + idToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      await logout();
      throw new Error('Session expired');
    }

    return response;
  }, [user, logout]);
}
