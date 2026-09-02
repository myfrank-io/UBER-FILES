// Contexte partagé du parcours de configuration : la page fournit l'état et la
// navigation, chaque écran (components/setup/*) les consomme.
import type { InjectionKey, Ref, ComputedRef } from 'vue'
import type { SetupResult, SetupStepKey } from '~/lib/setup-flow'
import type { SetupStateView } from '~/lib/setup-view'

export interface SetupFlowContext {
  state: Ref<SetupStateView | null>
  result: ComputedRef<SetupResult | null>
  current: Ref<SetupStepKey | 'intro'>
  /** Recharge l'état depuis le serveur (après chaque enregistrement). */
  refresh: () => Promise<void>
  /** Recharge puis passe à la prochaine étape non faite. */
  next: () => Promise<void>
  back: () => void
  goTo: (key: SetupStepKey | 'intro') => void
  /** La session a été ouverte par le lien de configuration. */
  setupSession: ComputedRef<boolean>
}

export const SETUP_FLOW_KEY: InjectionKey<SetupFlowContext> = Symbol('setup-flow')

export function provideSetupFlow(ctx: SetupFlowContext) {
  provide(SETUP_FLOW_KEY, ctx)
}

export function useSetupFlow(): SetupFlowContext {
  const ctx = inject(SETUP_FLOW_KEY)
  if (!ctx) throw new Error('useSetupFlow() hors du parcours de configuration.')
  return ctx
}
