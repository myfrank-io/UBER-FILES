type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

const toasts = ref<Toast[]>([])
let _id = 0

export function useToast() {
  function dismiss(id: number) {
    const i = toasts.value.findIndex((t) => t.id === id)
    if (i !== -1) toasts.value.splice(i, 1)
  }

  function add(message: string, type: ToastType = 'info', duration = 4000) {
    const id = ++_id
    toasts.value.push({ id, message, type })
    setTimeout(() => dismiss(id), duration)
  }

  return {
    toasts: readonly(toasts),
    dismiss,
    success: (m: string, d?: number) => add(m, 'success', d),
    error: (m: string, d?: number) => add(m, 'error', d),
    info: (m: string, d?: number) => add(m, 'info', d),
  }
}
