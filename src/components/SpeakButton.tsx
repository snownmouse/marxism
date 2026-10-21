import { useSyncExternalStore } from 'react'
import { play, stop, subscribe, getSnapshot } from '../services/tts'
import '../styles/voice.css'

interface SpeakButtonProps {
  /** dialogs.json 中的对话 id（音频清单的键） */
  audioId: string
  /** 音频缺失时用浏览器语音朗读的降级文本 */
  fallbackText?: string
  /** 按钮提示 */
  title?: string
  /** 附加类名 */
  className?: string
}

/**
 * 朗读按钮：播放预制音频（public/audio/dialog/）。
 * 三态：idle → loading（加载中）→ playing（播放中，再点一次停止）。
 */
export default function SpeakButton({
  audioId,
  fallbackText,
  title = '朗读',
  className = '',
}: SpeakButtonProps) {
  const { status, currentId } = useSyncExternalStore(subscribe, getSnapshot)
  const isActive = currentId === audioId && (status === 'playing' || status === 'loading')

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isActive) {
      stop()
    } else {
      play(audioId, fallbackText)
    }
  }

  return (
    <button
      className={`speak-btn ${isActive ? 'active' : ''} ${className}`}
      onClick={handleClick}
      title={isActive ? '停止朗读' : title}
      aria-label={isActive ? '停止朗读' : title}
    >
      {isActive ? '⏹' : '🔊'}
    </button>
  )
}
