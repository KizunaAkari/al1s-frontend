import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import { apiClient } from '../src/shared/api/client'
import ScheduleRevisionDialog from '../src/modules/tasks/ScheduleRevisionDialog.vue'
import type { ActiveSchedule } from '../src/shared/api/tasks'

const schedule = {
  schedule_id: 'schedule-1',
  row_version: 7,
  start_date: '2026-09-04',
  end_date: '2026-09-18',
  daily_times: ['11:00:00', '19:00:00'],
} as ActiveSchedule

const stubs = {
  ElButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  },
  ElDatePicker: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="schedule-date" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  ElDialog: {
    props: ['modelValue'],
    template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
  },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="daily-times" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}

afterEach(() => vi.restoreAllMocks())

function view() {
  return mount(ScheduleRevisionDialog, {
    props: { modelValue: true, schedule },
    global: { stubs },
  })
}

it('round-trips multiple saved times when only the end date changes', async () => {
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
    data: {
      schedule: {},
      revision: 2,
      changed: true,
      retained_occurrences: 1,
      cancelled_occurrences: 0,
      added_occurrences: 1,
    },
  })
  const wrapper = view()
  try {
    expect((wrapper.get('.daily-times').element as HTMLInputElement).value).toBe('11:00、19:00')
    await wrapper.findAll('.schedule-date')[1]!.setValue('2026-09-20')
    await wrapper.findAll('button').find(button => button.text() === '保存新修订')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/task-schedules/schedule-1/revision', {
      expected_version: 7,
      start_date: '2026-09-04',
      end_date: '2026-09-20',
      daily_times: ['11:00:00', '19:00:00'],
    })
  } finally {
    wrapper.unmount()
  }
})

it('accepts Chinese and English commas and spaces between times', async () => {
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
    data: {
      schedule: {},
      revision: 2,
      changed: true,
      retained_occurrences: 1,
      cancelled_occurrences: 0,
      added_occurrences: 1,
    },
  })
  const wrapper = view()
  try {
    await wrapper.get('.daily-times').setValue('11:00、19:00，21:00,22:00 23:00')
    await wrapper.findAll('button').find(button => button.text() === '保存新修订')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/task-schedules/schedule-1/revision', {
      expected_version: 7,
      start_date: '2026-09-04',
      end_date: '2026-09-18',
      daily_times: ['11:00:00', '19:00:00', '21:00:00', '22:00:00', '23:00:00'],
    })
  } finally {
    wrapper.unmount()
  }
})
