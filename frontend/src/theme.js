import { useEffect, useState } from 'react'

// Light / dark / system theme. The choice is saved on the device.
const KEY = 'tg_theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePref() {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

/** Adds or removes the "dark" class on <html>. Returns true when dark. */
export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#060d1b' : '#0b1d3a')
  return dark
}

/** const { pref, dark, choose, toggle } = useTheme() */
export function useTheme() {
  const [pref, setPref] = useState(getThemePref)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    // follow the phone's setting while on "system"
    const mq = media()
    const onChange = () => {
      if (getThemePref() === 'system') setDark(applyTheme('system'))
    }
    mq.addEventListener('change', onChange)
    // keep every useTheme() in sync when one of them changes the theme
    const onApplied = () => {
      setPref(getThemePref())
      setDark(document.documentElement.classList.contains('dark'))
    }
    window.addEventListener('tg-theme', onApplied)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('tg-theme', onApplied)
    }
  }, [])

  const choose = (next) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // storage blocked: still switch for this visit
    }
    applyTheme(next)
    window.dispatchEvent(new Event('tg-theme'))
  }

  return { pref, dark, choose, toggle: () => choose(dark ? 'light' : 'dark') }
}
