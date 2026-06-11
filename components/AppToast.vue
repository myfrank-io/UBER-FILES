<script setup lang="ts">
const { toasts, dismiss } = useToast()

const TYPE_STYLES = {
  success: 'bg-green-50 border-green-200 text-green-900',
  error: 'bg-red-50 border-red-200 text-red-900',
  info: 'bg-slate-50 border-slate-200 text-slate-900',
}
const TYPE_ICON = { success: '✅', error: '❌', info: 'ℹ️' }
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-6 right-4 z-[100] flex flex-col gap-2 sm:right-6">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg"
          :class="TYPE_STYLES[t.type]"
        >
          <span>{{ TYPE_ICON[t.type] }}</span>
          <p class="flex-1 text-sm font-medium">{{ t.message }}</p>
          <button class="ml-2 text-xs opacity-60 hover:opacity-100" @click="dismiss(t.id)">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
