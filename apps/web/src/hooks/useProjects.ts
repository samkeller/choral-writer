import { useEffect, useState } from 'react';
import type { Project } from '@choral-writer/shared';

import { listProjects } from '../api/projects.js';
import { getErrorMessage } from '../api/client.js';

/**
 * Charge la liste des projets et expose son rechargement après une mutation.
 * Annule la requête précédente au rechargement ou au démontage du composant.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listProjects(controller.signal)
      .then(setProjects)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  return { projects, loading, error, reload: () => setRevision((value) => value + 1) };
}
