import { useSyncExternalStore } from 'react'
import { speak, stop, subscribe, getSnapshot, cleanText } from '../services/tts'
import '../styles/voice.css'

interface SpeakButtonProps {
  /** 要朗读的文本 */
  text: string
  /** 按钮提示 */
  title?: string
  /** 附加类名 */
  className?: string
}

export default function SpeakButton({ text, title = '朗读', className = '' }: SpeakButtonProps) {
  const { status, activeText } = useSyncExternalStore(subscribe, getSnapshot)
  const cleaned = cleanText(text)
  const isActive = !!cleaned && activeText === cleaned && (status === 'playing' || status === 'loading')

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isActive) {
      stop()
    } else {
      speak(text)
    }
  }

  return (
    <button
      type="button"
      className={`speak-btn ${isActive ? 'speak-btn-active' : ''} ${className}`}
      onClick={handleClick}
      title={isActive ? '停止朗读' : title}
      aria-label={isActive ? '停止朗读' : title}
    >
      <span className={`speak-btn-icon ${isActive && status === 'loading' ? 'speak-btn-loading' : ''}`}>
        {isActive && status === 'loading' ? '⏳' : isActive ? '⏹' : '🔊'}
      </span>
      {isActive && status === 'playing' ? <span className="speak-btn-wave" /> : null}
    </button>
  )
}
