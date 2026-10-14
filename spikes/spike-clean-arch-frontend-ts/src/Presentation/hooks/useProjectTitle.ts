// Hook de apresentação: chama o caso de uso vindo do Composition Root e expõe um estado simples.
import { useEffect, useState } from 'react';
import { AppError, type AppErrorCode } from '@application/AppError';
import type { Language } from '@domain/ProjectTitles';
import { useDependencies } from '../di/DependenciesProvider';

export type ProjectTitleState =
  | { status: 'loading' }
  | { status: 'ready'; title: string }
  | { status: 'error'; code: AppErrorCode; apiCode?: string };

export function useProjectTitle(language: Language): ProjectTitleState {
  const { getProjectTitle } = useDependencies();
  const [state, setState] = useState<ProjectTitleState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getProjectTitle
      .execute(language)
      .then((title) => active && setState({ status: 'ready', title }))
      .catch((e: unknown) => {
        if (!active) return;
        const err = e instanceof AppError ? e : new AppError('NETWORK_ERROR');
        setState({ status: 'error', code: err.code, apiCode: err.apiCode });
      });
    return () => {
      active = false;
    };
  }, [getProjectTitle, language]);

  return state;
}
