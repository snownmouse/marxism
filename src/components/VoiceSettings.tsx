import { useState } from 'react'
import {
  getSettings,
  saveSettings,
  fetchModelList,
  readAudioFile,
  speak,
  DEFAULT_VOICE_SETTINGS,
  type VoiceSettings,
} from '../services/tts'

interface VoiceSettingsProps {
  onClose: () => void
}

export default function VoiceSettings({ onClose }: VoiceSettingsProps) {
  const [draft, setDraft] = useState<VoiceSettings>(getSettings())
  const [models, setModels] = useState<string[]>([])
  const [modelStatus, setModelStatus] = useState('')
  const [audioInfo, setAudioInfo] = useState(
    draft.refAudioName ? `当前参考音频：${draft.refAudioName}` : ''
  )

  const patch = (p: Partial<VoiceSettings>) => setDraft(d => ({ ...d, ...p }))

  const loadModels = async () => {
    setModelStatus('正在连接 GPT-SoVITS…')
    try {
      const list = await fetchModelList(draft.apiBase)
      setModels(list)
      setModelStatus(list.length > 0 ? `已获取 ${list.length} 个模型` : '连接成功，但未获取到模型')
    } catch (err) {
      setModelStatus(`连接失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const onPickAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { b64, durationSec } = await readAudioFile(file)
      patch({ refAudioB64: b64, refAudioName: file.name })
      setAudioInfo(
        durationSec > 0
          ? `已选择 ${file.name}（时长 ${durationSec.toFixed(1)} 秒，建议 3～10 秒）`
          : `已选择 ${file.name}`
      )
    } catch {
      setAudioInfo('音频读取失败，请换一个文件试试')
    }
  }

  const handleSave = () => {
    saveSettings(draft)
    onClose()
  }

  const testSpeak = () => {
    saveSettings(draft)
    speak('这是语音测试，欢迎来到原理社会。')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content voice-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔊 语音设置</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="voice-form">
          <div className="voice-hint">
            配置本地 GPT-SoVITS 推理服务后，即可用自定义音色朗读全部学习内容；
            未配置时自动使用浏览器内置语音。
          </div>

          <div className="voice-field">
            <label>语音引擎</label>
            <div className="voice-engine-options">
              {([
                ['auto', '自动（推荐）', '优先 GPT-SoVITS，失败时用浏览器语音'],
                ['gpt-sovits', '仅 GPT-SoVITS', '只使用自定义音色，不自动降级'],
                ['browser', '仅浏览器', '使用系统内置语音，无需配置'],
              ] as const).map(([value, label, desc]) => (
                <label key={value} className={`voice-engine-card ${draft.engine === value ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="tts-engine"
                    value={value}
                    checked={draft.engine === value}
                    onChange={() => patch({ engine: value })}
                  />
                  <span className="voice-engine-label">{label}</span>
                  <span className="voice-engine-desc">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          {draft.engine !== 'browser' && (
            <>
              <div className="voice-field">
                <label htmlFor="tts-api-base">API 地址</label>
                <div className="voice-inline">
                  <input
                    id="tts-api-base"
                    type="text"
                    value={draft.apiBase}
                    onChange={e => patch({ apiBase: e.target.value })}
                    placeholder="http://127.0.0.1:8000"
                  />
                  <button type="button" className="voice-btn" onClick={loadModels}>获取模型列表</button>
                </div>
                {modelStatus && <div className="voice-field-tip">{modelStatus}</div>}
              </div>

              <div className="voice-field">
                <label htmlFor="tts-model">模型名称</label>
                <input
                  id="tts-model"
                  type="text"
                  list="tts-model-list"
                  value={draft.modelName}
                  onChange={e => patch({ modelName: e.target.value })}
                  placeholder="填入 GPT-SoVITS 中已加载的模型名"
                />
                <datalist id="tts-model-list">
                  {models.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              <div className="voice-field">
                <label htmlFor="tts-ref-audio">参考音频（3～10 秒）</label>
                <input
                  id="tts-ref-audio"
                  type="file"
                  accept="audio/*"
                  onChange={onPickAudio}
                />
                {audioInfo && <div className="voice-field-tip">{audioInfo}</div>}
              </div>

              <div className="voice-field">
                <label htmlFor="tts-prompt-text">参考音频对应的台词</label>
                <textarea
                  id="tts-prompt-text"
                  rows={2}
                  value={draft.promptText}
                  onChange={e => patch({ promptText: e.target.value })}
                  placeholder="参考音频里说话的内容，需与音频一致"
                />
              </div>
            </>
          )}

          <div className="voice-field">
            <label htmlFor="tts-speed">语速：{draft.speed.toFixed(1)}×</label>
            <input
              id="tts-speed"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={draft.speed}
              onChange={e => patch({ speed: Number(e.target.value) })}
            />
          </div>

          <div className="voice-actions">
            <button type="button" className="voice-btn" onClick={testSpeak}>🔈 测试朗读</button>
            <button
              type="button"
              className="voice-btn voice-btn-ghost"
              onClick={() => {
                setDraft({ ...DEFAULT_VOICE_SETTINGS })
                setAudioInfo('')
                setModelStatus('')
              }}
            >
              恢复默认
            </button>
            <div className="voice-actions-spacer" />
            <button type="button" className="voice-btn voice-btn-ghost" onClick={onClose}>取消</button>
            <button type="button" className="voice-btn voice-btn-primary" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}
