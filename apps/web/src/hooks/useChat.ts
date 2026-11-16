import { useEffect, useRef, useState } from 'react';
import type { Message, Project } from '@choral-writer/shared';

import { getErrorMessage } from '../api/client.js';
import { getMessages, getProject } from '../api/projects.js';
import { streamTurn } from '../api/chat.js';

/**
 * TODO DOC
 */
export function useChat(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [partial, setPartial] = useState('');
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([getProject(projectId, controller.signal), getMessages(projectId, controller.signal)])
      .then(([project, messages]) => { setProject(project); setMessages(messages); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [projectId, revision]);

  async function send(content: string): Promise<boolean> {
    if (activeRequest.current) throw new Error('Un message est déjà en cours d’envoi.');
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError('');
    setPartial('');
    let userMessageId: string | undefined;
    let persisted = false;
    try {
      await streamTurn(projectId, content, controller.signal, (event) => {
        if (event.type === 'chat.turn.started') {
          userMessageId = event.message.id;
          setMessages((messages) => [...messages, event.message]);
        } else if (event.type === 'chat.message.delta') {
          setPartial((text) => text + event.delta);
        } else if (event.type === 'chat.turn.completed') {
          persisted = true;
          setMessages((messages) => [...messages, event.message]);
          setPartial('');
        }
      });
    } catch (error) {
      if (!controller.signal.aborted) setError(getErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        try {
          const history = await getMessages(projectId, controller.signal);
          setMessages(history);
          persisted = history.some((message) => message.id === userMessageId);
        } catch (error) {
          if (!controller.signal.aborted) {
            setError((current) => [current, getErrorMessage(error)].filter(Boolean).join(' '));
          }
        }
        if (!controller.signal.aborted) setPending(false);
      }
      if (activeRequest.current === controller) activeRequest.current = null;
    }
    return persisted;
  }

  return {
    project, messages, loading, error, pending, partial, send,
    reload: () => setRevision((value) => value + 1),
  };
}
