import type { CSSProperties } from "react"

type P = { className?: string; style?: CSSProperties }
const S = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props} />
)
export const IconLogo = (p: P) => (<svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 16 L9 10 L13 13 L20 5" /><path d="M15 5 L20 5 L20 10" /></svg>)
export const IconSearch = (p: P) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>)
export const IconSpark = (p: P) => (<S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></S>)
export const IconBolt = (p: P) => (<S {...p}><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></S>)
export const IconPlus = (p: P) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>)
export const IconBack = (p: P) => (<S {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></S>)
export const IconCompare = (p: P) => (<S {...p}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></S>)
export const IconCheck = (p: P) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5" /></svg>)
export const IconBulb = (p: P) => (<S {...p}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></S>)
export const IconTrendUp = (p: P) => (<S {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7h-6M21 7v6" /></S>)
export const IconInfo = (p: P) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></S>)
export const IconSend = (p: P) => (<S {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></S>)
export const IconRefresh = (p: P) => (<S {...p}><path d="M21 12a9 9 0 1 1-6.2-8.5" /><path d="M21 3v6h-6" /></S>)
export const IconEdit = (p: P) => (<S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></S>)
