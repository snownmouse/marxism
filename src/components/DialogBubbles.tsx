import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { askAbout } from '../lib/aiModel'
import SpeakButton from './SpeakButton'

const BUBBLE_W = 200
const BUBBLE_OFFSET_X = Math.floor(BUBBLE_W / 2)

export default function DialogBubbles() {
  const bubbles = useAppStore(s => s.bubbles)
  const removeBubble = useAppStore(s => s.removeBubble)
  const setGlossaryPopup = useAppStore(s => s.setGlossaryPopup)
  const glossary = useAppStore(s => s.glossary)
  const setNpc = useAppStore(s => s.setNpc)

  const [vw, setVw] = useState(window.innerWidth)
  const [vh, setVh] = useState(window.innerHeight)

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (bubbles.length === 0) return null

  const maxLeft = Math.max(4, vw - BUBBLE_W - 4)
  const maxTop = Math.max(4, vh - 80)

  return (
    <>
      {bubbles.map(bubble => {
        const gItem = glossary.find(g => g.id === bubble.glossaryId)
        const isQuirky = bubble.chatType === 'quirky'
        const isChatter = bubble.chatType === 'chatter'
        const isUser = bubble.source === 'user'

        const rawLeft = bubble.x - BUBBLE_OFFSET_X
        const rawTop = bubble.y - 48
        const left = Math.min(maxLeft, Math.max(4, rawLeft))
        const top = Math.min(maxTop, Math.max(4, rawTop))

        const bubbleClass = [
          'dialog-bubble',
          isQuirky ? 'dialog-bubble-quirky' : '',
          isChatter ? 'dialog-bubble-chatter' : '',
          isUser ? 'dialog-bubble-user' : '',
        ].filter(Boolean).join(' ')

        return (
          <div
            key={bubble.id}
            className={bubbleClass}
            style={{
              left,
              top,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="dialog-bubble-inner">
              {!isUser && (
                <span className="dialog-bubble-class">{bubble.classType}</span>
              )}
              {isUser && (
                <span className="dialog-bubble-class dialog-bubble-user-tag">你</span>
              )}
              <span className="dialog-bubble-text">{bubble.text}</span>
            </div>
            <div className={`dialog-bubble-tail ${isQuirky ? 'dialog-bubble-tail-quirky' : ''}`} />
            {!isUser && (
              <SpeakButton
                audioId={bubble.dialogId}
                fallbackText={bubble.text}
                title="朗读这句话"
                className="speak-btn-bubble"
              />
            )}
            {!isUser && (
              <button
                className="dialog-bubble-ask"
                title="问小原：这句话背后的理论是什么"
                onClick={() => {
                  askAbout(String(bubble.classType || ''), bubble.text)
                  setNpc(true)
                }}
              >
                💬
              </button>
            )}
            {gItem && (
              <button
                className="dialog-bubble-info"
                onClick={() => {
                  setGlossaryPopup(gItem)
                }}
                title={gItem.term}
              >
                ℹ
              </button>
            )}
            <button
              className="dialog-bubble-close"
              onClick={() => removeBubble(bubble.id)}
            >
              ✕
            </button>
          </div>
        )
      })}
    </>
  )
}
