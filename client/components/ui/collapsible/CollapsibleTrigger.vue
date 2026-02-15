<script setup lang="ts">
import { CollapsibleTrigger as CollapsibleTriggerPrimitive, type CollapsibleTriggerProps } from 'reka-ui'

const props = defineProps<CollapsibleTriggerProps>()
</script>

<template>
  <CollapsibleTriggerPrimitive v-bind="props">
    <slot />
  </CollapsibleTriggerPrimitive>
</template>
