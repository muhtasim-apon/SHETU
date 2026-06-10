'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Camera, Loader2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface Account {
  id: string
  email?: string | null
  full_name?: string | null
  phone?: string | null
  role?: string | null
  avatar_url?: string | null
}

const AVATAR_BUCKET = 'avatars'

function initials(name?: string | null) {
  if (!name) return ''
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function readLocalUser(): Account | null {
  try {
    const raw = localStorage.getItem('shetu_user')
    if (!raw) return null
    return JSON.parse(raw) as Account
  } catch {
    return null
  }
}

function writeLocalUser(patch: Partial<Account>) {
  try {
    const cur = readLocalUser() ?? ({} as Account)
    localStorage.setItem('shetu_user', JSON.stringify({ ...cur, ...patch }))
  } catch { /* ignore */ }
}

export default function ProfileModule({ dashboardType }: { dashboardType: 'mother' | 'patient' }) {
  const router = useRouter()
  const [acc, setAcc] = useState<Account | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!localStorage.getItem('shetu_token')) { router.replace('/auth/signin'); return }
    const local = readLocalUser()
    if (local) {
      setAcc(local)
      setFullName(local.full_name ?? '')
      setPhone(local.phone ?? '')
    }
    // Refresh canonical fields (incl. avatar) from Supabase — browser networking
    // is reliable here, unlike the backend under WSL2.
    void refreshFromSupabase(local?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function refreshFromSupabase(id?: string) {
    try {
      const sb = createClient()
      const { data: userData } = await sb.auth.getUser()
      const meta = (userData.user?.user_metadata as Record<string, unknown>) ?? {}
      const avatar_url = (meta.avatar_url as string) ?? null
      const userId = id ?? userData.user?.id
      let row: Partial<Account> = {}
      if (userId) {
        const { data } = await sb.from('profiles').select('full_name, phone, email, role').eq('id', userId).maybeSingle()
        if (data) row = data as Partial<Account>
      }
      setAcc((prev) => {
        const next = { ...(prev ?? {}), ...row, avatar_url, id: userId ?? prev?.id } as Account
        return next
      })
      if (row.full_name) setFullName((v) => v || (row.full_name as string))
      if (row.phone) setPhone((v) => v || (row.phone as string))
      writeLocalUser({ ...row, avatar_url: avatar_url ?? undefined })
    } catch { /* keep local values */ }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function save() {
    if (!acc?.id) return
    setSaving(true); setError('')
    try {
      const sb = createClient()
      const { error: upErr } = await sb.from('profiles').update({ full_name: fullName, phone }).eq('id', acc.id)
      if (upErr) throw new Error(upErr.message)
      setAcc((p) => (p ? { ...p, full_name: fullName, phone } : p))
      writeLocalUser({ full_name: fullName, phone })
      showToast('Profile saved!')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !acc?.id) return
    if (!f.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return }
    setUploading(true); setError('')
    try {
      const sb = createClient()
      const ext = f.type.split('/')[1] === 'png' ? 'png' : f.type.includes('webp') ? 'webp' : 'jpg'
      const path = `${acc.id}/avatar.${ext}`
      const { error: upErr } = await sb.storage.from(AVATAR_BUCKET).upload(path, f, {
        upsert: true,
        contentType: f.type,
      })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      await sb.auth.updateUser({ data: { avatar_url: url } })
      setAcc((p) => (p ? { ...p, avatar_url: url } : p))
      writeLocalUser({ avatar_url: url })
      showToast('Profile photo updated!')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-28">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push(`/dashboard/${dashboardType}`)} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">My Profile</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

        {/* Avatar */}
        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col items-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-[#0E7C66] overflow-hidden flex items-center justify-center text-white text-2xl font-semibold">
              {acc?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={acc.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : acc?.full_name ? (
                initials(acc.full_name)
              ) : (
                <User size={32} />
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-[#0E7C66] disabled:opacity-60"
              title="Change photo"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickFile} />
          </div>
          <p className="mt-3 font-semibold text-gray-800">{acc?.full_name ?? '…'}</p>
          <p className="text-xs text-gray-400 capitalize">{acc?.role ?? ''}</p>
        </div>

        {/* Account info */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-800">Account Information</h2>

          <div>
            <label className="text-sm text-gray-600">Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-sm text-gray-600">Email</label>
            <input value={acc?.email ?? ''} disabled
              className="mt-1 w-full border border-gray-100 bg-gray-50 text-gray-500 rounded-xl px-3 py-2 text-sm" />
            <p className="text-[11px] text-gray-400 mt-1">Email can&apos;t be changed here.</p>
          </div>

          <div>
            <label className="text-sm text-gray-600">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880…"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-sm text-gray-600">Role</label>
            <input value={acc?.role ?? ''} disabled
              className="mt-1 w-full border border-gray-100 bg-gray-50 text-gray-500 rounded-xl px-3 py-2 text-sm capitalize" />
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto">
          <button onClick={save} disabled={saving}
            className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed top-4 inset-x-0 flex justify-center">
          <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded-full">{toast}</div>
        </div>
      )}
    </div>
  )
}
