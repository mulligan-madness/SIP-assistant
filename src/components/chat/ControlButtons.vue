<template>
  <div class="controls">
    <button class="action-button" @click="$emit('export')">
      Export Chat History
    </button>
    <button class="action-button" @click="$emit('enforce')">
      Enforce Section Headers
    </button>
    <button class="action-button" @click="$emit('pretty')">
      Ask for Pretty Text
    </button>
    <button class="action-button" @click="$emit('markdown')">
      Ask for Markdown
    </button>
    <button class="action-button" :class="{ 'active': isResearchActive }" @click="toggleResearch">
      <span v-if="isResearchActive">Hide Research Panel</span>
      <span v-else>Show Research Panel</span>
    </button>
  </div>
</template>

<script setup>
import { defineEmits, defineProps } from 'vue';

// Define props
const props = defineProps({
  isResearchActive: {
    type: Boolean,
    default: false
  }
});

// Define emits
const emit = defineEmits(['export', 'enforce', 'pretty', 'markdown', 'research']);

// Toggle research panel
const toggleResearch = () => {
  emit('research');
};
</script>

<style scoped>
.controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.action-button {
  flex: 1;
  min-width: 180px;
  height: 44px;
  padding: 8px 16px;
  background: var(--button-secondary);
  color: var(--button-text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  box-shadow: 0 1px 2px var(--button-shadow);
}

.action-button:hover {
  background: var(--button-primary);
  color: var(--button-text-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--button-shadow);
}

.action-button.active {
  background: var(--button-primary);
  color: var(--button-text-primary);
}

/* Responsive design */
@media (min-width: 768px) {
  .controls {
    flex-wrap: nowrap;
  }
  
  .action-button {
    min-width: 140px;
  }
}
</style>
