'use client'

export type ChatbotAction =
  | { type: 'navigate'; path: string }
  | { type: 'open_sos' }
  | { type: 'fill_form'; formId: string; fields: Record<string, string> }
  | { type: 'click_element'; selector: string }
  | { type: 'scroll_to'; selector: string }
  | { type: 'speak'; text: string }

const ACTION_PATTERN = /\{[^}]*"__action"[^}]*\}/g

export function parseActions(text: string): { cleanText: string; actions: ChatbotAction[] } {
  const actions: ChatbotAction[] = []
  const cleanText = text
    .replace(ACTION_PATTERN, match => {
      try {
        const obj = JSON.parse(match) as Record<string, unknown>
        const action = obj.__action as string
        if (action === 'navigate') {
          actions.push({ type: 'navigate', path: obj.path as string })
        } else if (action === 'open_sos') {
          actions.push({ type: 'open_sos' })
        } else if (action === 'fill_form') {
          actions.push({
            type: 'fill_form',
            formId: obj.formId as string,
            fields: obj.fields as Record<string, string>,
          })
        } else if (action === 'click_element') {
          actions.push({ type: 'click_element', selector: obj.selector as string })
        } else if (action === 'scroll_to') {
          actions.push({ type: 'scroll_to', selector: obj.selector as string })
        } else if (action === 'speak') {
          actions.push({ type: 'speak', text: obj.text as string })
        }
      } catch {
        // Malformed JSON — ignore
      }
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanText, actions }
}

export function fillReactInput(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  // Trigger React's synthetic event system
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set
  nativeInputValueSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export async function executeActions(
  actions: ChatbotAction[],
  router: { push: (path: string) => void }
): Promise<void> {
  for (const action of actions) {
    await new Promise(r => setTimeout(r, 300))

    if (action.type === 'navigate') {
      router.push(action.path)
    } else if (action.type === 'open_sos') {
      router.push('/dashboard/mother/pregnancy/sos')
    } else if (action.type === 'fill_form') {
      const fields = action.fields
      await new Promise(r => setTimeout(r, 600)) // wait for page to load
      for (const [fieldId, value] of Object.entries(fields)) {
        const el = document.querySelector(`[data-field-id="${fieldId}"]`) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
          | null
        if (el) fillReactInput(el, value)
      }
    } else if (action.type === 'click_element') {
      const el = document.querySelector(action.selector) as HTMLElement | null
      el?.click()
    } else if (action.type === 'scroll_to') {
      const el = document.querySelector(action.selector)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

export function getPageLabel(path: string): string {
  const labels: Record<string, string> = {
    '/dashboard/mother': 'Mother Dashboard',
    '/dashboard/mother/pregnancy': 'Pregnancy Tracker',
    '/dashboard/mother/pregnancy/chat': 'Pregnancy Chat',
    '/dashboard/mother/pregnancy/vitals': 'Pregnancy Vitals',
    '/dashboard/mother/pregnancy/sos': 'SOS Emergency',
    '/dashboard/mother/nutrition': 'Nutrition Plan',
    '/dashboard/mother/risk-prediction': 'Risk Assessment',
    '/dashboard/mother/saathi/consultancy': 'Doctor Consultancy',
    '/dashboard/mother/saathi/report': 'Health Report',
    '/dashboard/mother/saathi/blog': 'Health Blog',
    '/dashboard/patient': 'Patient Dashboard',
    '/dashboard/patient/health-assistant': 'Health Assistant',
    '/dashboard/patient/nutrition': 'Nutrition Plan',
    '/dashboard/patient/risk-prediction': 'Risk Assessment',
    '/dashboard/patient/saathi/checkin': 'Daily Check-In',
    '/dashboard/patient/saathi/vitals': 'Vitals Tracker',
    '/dashboard/patient/saathi/goals': 'Health Goals',
    '/dashboard/patient/saathi/profile': 'Profile',
    '/dashboard/patient/saathi/report': 'Health Report',
    '/dashboard/patient/saathi/consultancy': 'Doctor Consultancy',
    '/dashboard/patient/saathi/blog': 'Health Blog',
  }
  return labels[path] ?? path
}
