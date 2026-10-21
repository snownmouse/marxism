import { useEffect, useState } from 'react'
import { getManifest, VoiceMeta } from '../services/tts'
import '../styles/voice.css'

const FAMILY_ORDER = ['市井百姓', '原始公社', '奴隶制', '封建时代', '资本主义', '社会主义', '共产主义', '拟人概念', '拟人建筑']

const FAMILY_ICON: Record<string, string> = {
  '市井百姓': '🏘️',
  '原始公社': '🔥',
  '奴隶制': '⛓️',
  '封建时代': '🏰',
  '资本主义': '🏭',
  '社会主义': '🌾',
  '共产主义': '🌟',
  '拟人概念': '💭',
  '拟人建筑': '🏛️',
}

const GENDER_LABEL: Record<string, string> = { F: '女声', M: '男声', N: '中性' }

interface Props {
  onClose: () => void
}

/**
 * 音色图鉴：展示全部预制音色的人设、家族与版权来源。
 * 数据来自 public/audio/manifest.json（合成时生成）。
 */
export default function VoiceGallery({ onClose }: Props) {
  const [voices, setVoices] = useState<Record<string, VoiceMeta> | null>(null)
  const [model, setModel] = useState<string>('')
  const [generatedAt, setGeneratedAt] = useState<string>('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getManifest().then(mf => {
      if (mf?.voices) {
        setVoices(mf.voices)
        setModel(mf.model || '')
        setGeneratedAt(mf.generatedAt || '')
      } else {
        setFailed(true)
      }
    })
  }, [])

  const grouped = FAMILY_ORDER.map(fam => ({
    family: fam,
    items: Object.entries(voices || {}).filter(([, v]) => v.family === fam),
  })).filter(g => g.items.length > 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content voice-gallery-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🎙️ 音色图鉴</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="voice-gallery-body">
          {failed && (
            <div className="voice-gallery-empty">
              音频清单尚未生成（音频合成后自动出现）。
            </div>
          )}
          {voices && Object.keys(voices).length === 0 && (
            <div className="voice-gallery-empty">暂无音色数据。</div>
          )}

          {grouped.map(g => (
            <div key={g.family} className="voice-gallery-family">
              <div className="voice-gallery-family-title">
                <span>{FAMILY_ICON[g.family] || '🎤'}</span> {g.family}
                <span className="voice-gallery-family-count">{g.items.length} 个音色</span>
              </div>
              <div className="voice-gallery-grid">
                {g.items.map(([id, v]) => (
                  <div key={id} className="voice-card">
                    <div className="voice-card-head">
                      <span className={`voice-card-gender gender-${v.gender}`}>
                        {GENDER_LABEL[v.gender] || v.gender}
                      </span>
                      <span className="voice-card-id">{id}</span>
                    </div>
                    <div className="voice-card-persona">{v.persona}</div>
                    {v.source?.dataset && (
                      <div className="voice-card-source" title="音色来源（开源数据集）">
                        🎲 {v.source.dataset}
                        {v.source.speaker ? ` · ${v.source.speaker}` : ''}
                        {v.source.license ? ` · ${v.source.license}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {voices && Object.keys(voices).length > 0 && (
            <div className="voice-gallery-footer">
              <p>
                全部音色由<b>开源语音数据集</b>经 GPT-SoVITS 在本机合成，不代表任何真实人物立场。
              </p>
              {model && <p className="voice-gallery-meta">合成模型：{model}</p>}
              {generatedAt && <p className="voice-gallery-meta">生成时间：{generatedAt}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
