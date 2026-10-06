<script setup lang="ts">
import { DialogClose, type DialogCloseProps, useForwardProps } from 'reka-ui'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'

const props = defineProps<DialogCloseProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <DialogClose
    v-bind="forwarded"
    :class="cn(
      'absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100',
      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
      'disabled:pointer-events-none',
      props.class,
    )"
  >
    <slot>
      <X class="size-4" />
    </slot>
  </DialogClose>
</template>
