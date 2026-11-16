import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
});

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<unknown>(error)) {
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const detail = data.error;
      if (typeof detail === 'object' && detail !== null && 'message' in detail
        && typeof detail.message === 'string') {
        return detail.message;
      }
    }
    if (error.response) {
      return `Le serveur a répondu avec le code ${error.response.status}.`;
    }
    return 'Le serveur est inaccessible. Réessayez dans quelques instants.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}
