'use client'

import { useState } from 'react'
import { X, FlaskConical } from 'lucide-react'

interface LabField {
  id: string
  label: string
  unit: string
  placeholder: string
  normalRange: string
}

const LAB_FIELDS: LabField[] = [
  { id: 'hemoglobin',  label: 'Hemoglobin',     unit: 'g/dL',    placeholder: 'e.g. 12.5',  normalRange: 'F: 12–16 | M: 13.5–17.5' },
  { id: 'glucose',     label: 'Blood Glucose',  unit: 'mg/dL',   placeholder: 'e.g. 95',    normalRange: 'Fasting: 70–99' },
  { id: 'hba1c',       label: 'HbA1c',          unit: '%',       placeholder: 'e.g. 5.6',   normalRange: 'Normal: < 5.7%' },
  { id: 'systolic',    label: 'Blood Pressure',  unit: 'mmHg',    placeholder: 'Systolic',   normalRange: 'Normal: < 120/80' },
  { id: 'diastolic',   label: '',                unit: 'mmHg',    placeholder: 'Diastolic',  normalRange: '' },
  { id: 'creatinine',  label: 'Creatinine',      unit: 'mg/dL',   placeholder: 'e.g. 0.9',   normalRange: 'F: 0.5–1.1 | M: 0.7–1.3' },
  { id: 'tsh',         label: 'TSH',             unit: 'mIU/L',   placeholder: 'e.g. 2.5',   normalRange: '0.4–4.0' },
  { id: 'wbc',         label: 'WBC',             unit: '×10³/µL', placeholder: 'e.g. 7.5',   normalRange: '4.5–11.0' },
  { id: 'platelets',   label: 'Platelets',       unit: '×10³/µL', placeholder: 'e.g. 250',   normalRange: '150–400' },
  { id: 'cholesterol', label: 'Total Cholesterol', unit: 'mg/dL', placeholder: 'e.g. 180',   normalRange: '< 200 desirable' },
  { id: 'ldl',         label: 'LDL',             unit: 'mg/dL',   placeholder: 'e.g. 110',   normalRange: '< 130 optimal' },
  { id: 'hdl',         label: 'HDL',             unit: 'mg/dL',   placeholder: 'e.g. 50',    normalRange: 'F: > 50 | M: > 40' },
]

interface Props {
  onSubmit: (message: string) => void
  onClose: () => void
}

export default function LabValuesForm({ onSubmit, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  function handleChange(id: string, val: string) {
    setValues(prev => ({ ...prev, [id]: val }))
  }

  function handleSubmit() {
    const entered = LAB_FIELDS.filter(f => values[f.id]?.trim())
    if (entered.length === 0) return

    const lines = entered.map(f => {
      if (f.id === 'systolic' && values['diastolic']) {
        return `Blood Pressure: ${values['systolic']}/${values['diastolic']} mmHg`
      }
      if (f.id === 'diastolic') return null // already included with systolic
      return `${f.label}: ${values[f.id]} ${f.unit}`
    }).filter(Boolean)

    let message = `Here are my lab results:\n${lines.join('\n')}`
    if (notes.trim()) message += `\n\nAdditional notes: ${notes.trim()}`
    message += '\n\nPlease analyse these and highlight anything that needs attention.'

    onSubmit(message)
  }

  const hasAnyValue = LAB_FIELDS.some(f => values[f.id]?.trim())

  return (
    <div className="mx-3 mb-3 rounded-2xl border border-purple-100 bg-white shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
        <FlaskConical size={16} className="text-purple-500 flex-shrink-0" />
        <p className="text-sm font-semibold text-purple-800 flex-1">Enter Lab Results</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5">
          <X size={15} />
        </button>
      </div>

      {/* Fields */}
      <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
        {LAB_FIELDS.map(field => {
          if (field.id === 'diastolic') return null // rendered inline with systolic
          const isBP = field.id === 'systolic'

          return (
            <div key={field.id}>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-medium text-gray-600 w-28 flex-shrink-0">
                  {field.label}
                </label>
                {isBP ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="number"
                      placeholder="Sys"
                      value={values['systolic'] ?? ''}
                      onChange={e => handleChange('systolic', e.target.value)}
                      className="w-16 px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-purple-400 bg-gray-50"
                    />
                    <span className="text-gray-400 text-xs">/</span>
                    <input
                      type="number"
                      placeholder="Dia"
                      value={values['diastolic'] ?? ''}
                      onChange={e => handleChange('diastolic', e.target.value)}
                      className="w-16 px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-purple-400 bg-gray-50"
                    />
                    <span className="text-[10px] text-gray-400">mmHg</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="number"
                      placeholder={field.placeholder}
                      value={values[field.id] ?? ''}
                      onChange={e => handleChange(field.id, e.target.value)}
                      className="w-24 px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-purple-400 bg-gray-50"
                    />
                    <span className="text-[10px] text-gray-400">{field.unit}</span>
                  </div>
                )}
                {field.normalRange && (
                  <span className="text-[9px] text-gray-300 hidden sm:block">{field.normalRange}</span>
                )}
              </div>
            </div>
          )
        })}

        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Additional notes</label>
          <textarea
            placeholder="Symptoms, medications, fasting status…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-purple-400 bg-gray-50 resize-none"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="px-3 pb-3">
        <button
          onClick={handleSubmit}
          disabled={!hasAnyValue}
          className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Analyse My Results
        </button>
      </div>
    </div>
  )
}
