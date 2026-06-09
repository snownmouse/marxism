import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import quizData from '../data/quizQuestions.json'

export interface QuizQuestion {
  id: string
  category: string
  type: 'single' | 'multiple' | 'judge'
  question: string
  options: string[]
  answer: number | number[]
  explanation: string
  relatedCards: string[]
}

type QuizMode = 'menu' | 'study' | 'exam' | 'wrong' | 'favorite' | 'result'
type StudyMode = 'long' | 'quick' // 长期复习 vs 考前冲刺

// localStorage 工具函数
const storage = {
  get: (key: string, defaultValue: any = null) => {
    try {
      const data = localStorage.getItem(`quiz_${key}`)
      return data ? JSON.parse(data) : defaultValue
    } catch { return defaultValue }
  },
  set: (key: string, value: any) => {
    localStorage.setItem(`quiz_${key}`, JSON.stringify(value))
  }
}

// 获取学习数据
const getStudyData = () => storage.get('study_data', {
  totalAnswered: 0,
  correctCount: 0,
  wrongIds: [] as string[],
  favoriteIds: [] as string[],
  lastStudyDate: '',
  streak: 0,
  dailyGoal: 20,
  dailyProgress: 0,
  chapterProgress: {} as Record<string, { total: number; correct: number }>
})

export default function QuizPanel() {
  const showQuiz = useAppStore(s => s.showQuiz)
  const setQuiz = useAppStore(s => s.setQuiz)
  
  const [mode, setMode] = useState<QuizMode>('menu')
  const [studyMode, setStudyMode] = useState<StudyMode>('long')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [selectedType, setSelectedType] = useState<string>('全部')
  const [selectedCount, setSelectedCount] = useState<number>(20)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const [answers, setAnswers] = useState<Map<number, { selected: number[]; correct: boolean }>>(new Map())
  const [timer, setTimer] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [studyData, setStudyData] = useState(getStudyData())
  
  // 模拟考试模式
  const [examTime, setExamTime] = useState(60) // 60分钟
  const [examStarted, setExamStarted] = useState(false)
  const [isExamMode, setIsExamMode] = useState(false) // 记录是否是考试模式

  const categories = ['全部', ...new Set(quizData.map(q => q.category))]
  const types = [
    { key: '全部', label: '全部题型' },
    { key: 'single', label: '单选题' },
    { key: 'multiple', label: '多选题' },
    { key: 'judge', label: '判断题' }
  ]

  // 更新学习数据
  const updateStudyData = useCallback((updates: Partial<ReturnType<typeof getStudyData>>) => {
    const newData = { ...studyData, ...updates }
    setStudyData(newData)
    storage.set('study_data', newData)
  }, [studyData])

  // 记录答题结果
  const recordAnswer = useCallback((questionId: string, isCorrect: boolean, category: string) => {
    const today = new Date().toDateString()
    const newData = { ...studyData }
    
    // 更新总数
    newData.totalAnswered += 1
    if (isCorrect) newData.correctCount += 1
    
    // 更新错题本
    if (!isCorrect && !newData.wrongIds.includes(questionId)) {
      newData.wrongIds.push(questionId)
    } else if (isCorrect && newData.wrongIds.includes(questionId)) {
      newData.wrongIds = newData.wrongIds.filter((id: string) => id !== questionId)
    }
    
    // 更新章节进度
    if (!newData.chapterProgress[category]) {
      newData.chapterProgress[category] = { total: 0, correct: 0 }
    }
    newData.chapterProgress[category].total += 1
    if (isCorrect) newData.chapterProgress[category].correct += 1
    
    // 更新每日进度
    if (newData.lastStudyDate !== today) {
      newData.lastStudyDate = today
      newData.dailyProgress = 0
      newData.streak += 1
    }
    newData.dailyProgress += 1
    
    setStudyData(newData)
    storage.set('study_data', newData)
  }, [studyData])

  // 收藏/取消收藏
  const toggleFavorite = useCallback((questionId: string) => {
    const newFavorites = studyData.favoriteIds.includes(questionId)
      ? studyData.favoriteIds.filter((id: string) => id !== questionId)
      : [...studyData.favoriteIds, questionId]
    updateStudyData({ favoriteIds: newFavorites })
  }, [studyData.favoriteIds, updateStudyData])

  // 获取筛选后的题目
  const getFilteredQuestions = useCallback(() => {
    let filtered = [...quizData] as QuizQuestion[]
    if (selectedCategory !== '全部') {
      filtered = filtered.filter(q => q.category === selectedCategory)
    }
    if (selectedType !== '全部') {
      filtered = filtered.filter(q => q.type === selectedType)
    }
    return filtered
  }, [selectedCategory, selectedType])

  // 开始学习模式
  const startStudy = useCallback(() => {
    const filtered = getFilteredQuestions()
    const shuffled = filtered.sort(() => Math.random() - 0.5)
    const count = Math.min(selectedCount, shuffled.length)
    setQuestions(shuffled.slice(0, count))
    resetQuiz()
    setMode('study')
    setIsRunning(true)
  }, [getFilteredQuestions, selectedCount])

  // 开始模拟考试
  const startExam = useCallback(() => {
    // 随机抽取100题（或全部）
    const allQuestions = (quizData as QuizQuestion[]).sort(() => Math.random() - 0.5)
    const examQuestions = allQuestions.slice(0, Math.min(100, allQuestions.length))
    setQuestions(examQuestions)
    resetQuiz()
    setMode('exam')
    setExamStarted(true)
    setIsExamMode(true)
    setIsRunning(true)
    setTimer(examTime * 60) // 转换为秒
  }, [examTime])

  // 开始错题练习
  const startWrongPractice = useCallback(() => {
    const wrongQuestions = (quizData as QuizQuestion[]).filter(q => studyData.wrongIds.includes(q.id))
    if (wrongQuestions.length === 0) return
    setQuestions(wrongQuestions.sort(() => Math.random() - 0.5))
    resetQuiz()
    setMode('wrong')
    setIsRunning(true)
  }, [studyData.wrongIds])

  // 开始收藏练习
  const startFavoritePractice = useCallback(() => {
    const favQuestions = (quizData as QuizQuestion[]).filter(q => studyData.favoriteIds.includes(q.id))
    if (favQuestions.length === 0) return
    setQuestions(favQuestions.sort(() => Math.random() - 0.5))
    resetQuiz()
    setMode('favorite')
    setIsRunning(true)
  }, [studyData.favoriteIds])

  const resetQuiz = () => {
    setCurrentIndex(0)
    setSelectedAnswers([])
    setConfirmed(false)
    setShowExplanation(false)
    setAnswers(new Map())
    setTimer(0)
  }

  // 计时器
  useEffect(() => {
    let interval: number | undefined
    if (isRunning && (mode === 'study' || mode === 'exam')) {
      interval = window.setInterval(() => {
        setTimer(t => {
          if (mode === 'exam' && t <= 1) {
            // 考试时间到
            setIsRunning(false)
            setMode('result')
            return 0
          }
          return t - (mode === 'exam' ? 1 : -1) // 学习模式计时增加，考试模式倒计时
        })
      }, 1000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [isRunning, mode])

  const toggleAnswer = (index: number) => {
    if (confirmed) return
    const currentQuestion = questions[currentIndex]
    if (currentQuestion.type === 'single' || currentQuestion.type === 'judge') {
      setSelectedAnswers([index])
      setTimeout(() => confirmAnswer(), 100)
    } else {
      setSelectedAnswers(prev => 
        prev.includes(index) 
          ? prev.filter(i => i !== index)
          : [...prev, index].sort((a, b) => a - b)
      )
    }
  }

  const confirmAnswer = () => {
    if (selectedAnswers.length === 0) return
    setConfirmed(true)
    
    const currentQuestion = questions[currentIndex]
    let isCorrect = false
    
    if (currentQuestion.type === 'single' || currentQuestion.type === 'judge') {
      isCorrect = selectedAnswers[0] === currentQuestion.answer
    } else {
      const correctAnswers = currentQuestion.answer as number[]
      isCorrect = selectedAnswers.length === correctAnswers.length &&
        selectedAnswers.every(a => correctAnswers.includes(a))
    }
    
    setAnswers(prev => new Map(prev).set(currentIndex, { selected: selectedAnswers, correct: isCorrect }))
    recordAnswer(currentQuestion.id, isCorrect, currentQuestion.category)
    setTimeout(() => {
      setShowExplanation(true)
      // 1秒后自动跳下一题
      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          nextQuestion()
        } else {
          setIsRunning(false)
          setMode('result')
        }
      }, 1000)
    }, 300)
  }

  const prevQuestion = () => {
    if (currentIndex > 0) {
      const prevAnswer = answers.get(currentIndex - 1)
      setCurrentIndex(prev => prev - 1)
      setSelectedAnswers(prevAnswer?.selected || [])
      setConfirmed(prevAnswer !== undefined)
      setShowExplanation(prevAnswer !== undefined)
    }
  }

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedAnswers([])
      setConfirmed(false)
      setShowExplanation(false)
    } else {
      setIsRunning(false)
      setMode('result')
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(Math.abs(seconds) / 60)
    const secs = Math.abs(seconds) % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const correctCount = Array.from(answers.values()).filter(a => a.correct).length
  const accuracy = studyData.totalAnswered > 0 
    ? Math.round(studyData.correctCount / studyData.totalAnswered * 100) 
    : 0

  if (!showQuiz) return null

  const currentQuestion = questions[currentIndex]
  const filteredCount = getFilteredQuestions().length

  return (
    <div className="modal-overlay" onClick={() => setQuiz(false)}>
      <div className="modal-content quiz-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📝 考试复习</h3>
          <button className="modal-close" onClick={() => setQuiz(false)}>✕</button>
        </div>

        {/* 主菜单 */}
        {mode === 'menu' && (
          <div className="quiz-menu">
            {/* 学习统计 */}
            <div className="study-stats">
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <div className="stat-value">{studyData.totalAnswered}</div>
                  <div className="stat-label">已答题目</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🎯</div>
                <div className="stat-info">
                  <div className="stat-value">{accuracy}%</div>
                  <div className="stat-label">正确率</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🔥</div>
                <div className="stat-info">
                  <div className="stat-value">{studyData.streak}</div>
                  <div className="stat-label">连续天数</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📅</div>
                <div className="stat-info">
                  <div className="stat-value">{studyData.dailyProgress}/{studyData.dailyGoal}</div>
                  <div className="stat-label">今日进度</div>
                </div>
              </div>
            </div>

            {/* 复习模式选择 */}
            <div className="mode-section">
              <h4>🎯 选择复习模式</h4>
              <div className="mode-cards">
                <div className="mode-card long-term" onClick={() => { setStudyMode('long'); setMode('study'); startStudy(); }}>
                  <div className="mode-icon">📚</div>
                  <div className="mode-title">系统学习</div>
                  <div className="mode-desc">按章节循序渐进，适合长期复习</div>
                  <div className="mode-features">
                    <span>✓ 章节练习</span>
                    <span>✓ 进度追踪</span>
                    <span>✓ 错题记录</span>
                  </div>
                </div>
                <div className="mode-card quick" onClick={() => { setStudyMode('quick'); startExam(); }}>
                  <div className="mode-icon">⚡</div>
                  <div className="mode-title">模拟考试</div>
                  <div className="mode-desc">限时答题，考前冲刺必备</div>
                  <div className="mode-features">
                    <span>✓ 100题限时</span>
                    <span>✓ 真实模拟</span>
                    <span>✓ 成绩报告</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 快捷入口 */}
            <div className="quick-actions">
              <button className="action-btn wrong" onClick={() => { if (studyData.wrongIds.length > 0) startWrongPractice(); }}>
                ❌ 错题本 ({studyData.wrongIds.length})
              </button>
              <button className="action-btn favorite" onClick={() => { if (studyData.favoriteIds.length > 0) startFavoritePractice(); }}>
                ⭐ 收藏夹 ({studyData.favoriteIds.length})
              </button>
            </div>

            {/* 章节进度 */}
            <div className="chapter-progress">
              <h4>📖 章节进度</h4>
              <div className="chapter-list">
                {categories.filter(c => c !== '全部').map(cat => {
                  const progress = studyData.chapterProgress[cat] || { total: 0, correct: 0 }
                  const total = (quizData as QuizQuestion[]).filter(q => q.category === cat).length
                  const percent = total > 0 ? Math.round(progress.total / total * 100) : 0
                  return (
                    <div key={cat} className="chapter-item" onClick={() => { setSelectedCategory(cat); setMode('study'); startStudy(); }}>
                      <div className="chapter-name">{cat}</div>
                      <div className="chapter-bar">
                        <div className="chapter-fill" style={{ width: `${percent}%` }}></div>
                      </div>
                      <div className="chapter-stat">{progress.total}/{total}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 学习模式 */}
        {(mode === 'study' || mode === 'wrong' || mode === 'favorite') && currentQuestion && (
          <div className="quiz-question">
            <div className="quiz-header">
              <div className="quiz-progress">
                <span className="progress-text">{currentIndex + 1} / {questions.length}</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
                </div>
              </div>
              <div className="quiz-timer">⏱️ {formatTime(timer)}</div>
            </div>

            <div className="question-meta">
              <span className="question-category">{currentQuestion.category}</span>
              <span className={`question-type type-${currentQuestion.type}`}>
                {currentQuestion.type === 'single' ? '单选' : currentQuestion.type === 'multiple' ? '多选' : '判断'}
              </span>
              <button 
                className={`fav-star ${studyData.favoriteIds.includes(currentQuestion.id) ? 'active' : ''}`}
                onClick={() => toggleFavorite(currentQuestion.id)}
              >
                {studyData.favoriteIds.includes(currentQuestion.id) ? '⭐' : '☆'}
              </button>
            </div>
            
            <div className="question-text">{currentQuestion.question}</div>

            <div className="options-list">
              {currentQuestion.options.map((option, index) => {
                let optionClass = 'option-item'
                const isSelected = selectedAnswers.includes(index)
                const isCorrectAnswer = currentQuestion.type === 'multiple'
                  ? (currentQuestion.answer as number[]).includes(index)
                  : currentQuestion.answer === index

                if (confirmed) {
                  if (isCorrectAnswer) optionClass += ' correct'
                  else if (isSelected && !isCorrectAnswer) optionClass += ' wrong'
                } else if (isSelected) {
                  optionClass += ' selected'
                }

                return (
                  <button key={index} className={optionClass} onClick={() => toggleAnswer(index)} disabled={confirmed}>
                    <span className="option-letter">
                      {currentQuestion.type === 'judge' ? (index === 0 ? '✓' : '✗') : String.fromCharCode(65 + index)}
                    </span>
                    <span className="option-text">{option}</span>
                    {confirmed && isCorrectAnswer && <span className="option-icon">✓</span>}
                    {confirmed && isSelected && !isCorrectAnswer && <span className="option-icon">✗</span>}
                  </button>
                )
              })}
            </div>

            {!confirmed && selectedAnswers.length > 0 && currentQuestion.type === 'multiple' && (
              <button className="confirm-btn" onClick={confirmAnswer}>确认答案</button>
            )}

            {showExplanation && (
              <div className="explanation-section">
                <div className="explanation-header">💡 答案解析</div>
                <div className="explanation-text">
                  {currentQuestion.explanation || `正确答案：${Array.isArray(currentQuestion.answer) 
                    ? currentQuestion.answer.map(a => String.fromCharCode(65 + a)).join('、')
                    : currentQuestion.type === 'judge' 
                      ? (currentQuestion.answer === 0 ? '正确' : '错误')
                      : String.fromCharCode(65 + currentQuestion.answer)}`}
                </div>
              </div>
            )}

            {showExplanation && (
              <div className="quiz-nav">
                <button 
                  className={`nav-btn prev ${currentIndex === 0 ? 'disabled' : ''}`} 
                  onClick={prevQuestion}
                  disabled={currentIndex === 0}
                >
                  ← 上一题
                </button>
                <button className="nav-btn" onClick={nextQuestion}>
                  {currentIndex < questions.length - 1 ? '下一题 →' : '查看结果'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 模拟考试模式 */}
        {mode === 'exam' && currentQuestion && (
          <div className="quiz-question exam-mode">
            <div className="exam-header">
              <div className="exam-title">📋 模拟考试</div>
              <div className={`exam-timer ${timer < 300 ? 'warning' : ''}`}>
                ⏱️ {formatTime(timer)}
              </div>
            </div>
            
            <div className="quiz-progress">
              <span className="progress-text">第 {currentIndex + 1} 题 / 共 {questions.length} 题</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
              </div>
            </div>

            <div className="question-meta">
              <span className={`question-type type-${currentQuestion.type}`}>
                {currentQuestion.type === 'single' ? '单选' : currentQuestion.type === 'multiple' ? '多选' : '判断'}
              </span>
            </div>
            
            <div className="question-text">{currentQuestion.question}</div>

            <div className="options-list">
              {currentQuestion.options.map((option, index) => {
                let optionClass = 'option-item'
                if (selectedAnswers.includes(index)) optionClass += ' selected'
                return (
                  <button key={index} className={optionClass} onClick={() => toggleAnswer(index)}>
                    <span className="option-letter">
                      {currentQuestion.type === 'judge' ? (index === 0 ? '✓' : '✗') : String.fromCharCode(65 + index)}
                    </span>
                    <span className="option-text">{option}</span>
                  </button>
                )
              })}
            </div>

            {!confirmed && selectedAnswers.length > 0 && (
              <button className="confirm-btn" onClick={confirmAnswer}>
                {currentIndex < questions.length - 1 ? '确认并下一题' : '确认并交卷'}
              </button>
            )}

            {confirmed && (
              <button className="nav-btn" onClick={nextQuestion}>
                {currentIndex < questions.length - 1 ? '下一题 →' : '交卷查看成绩'}
              </button>
            )}
          </div>
        )}

        {/* 结果页面 */}
        {mode === 'result' && (
          <div className="quiz-result">
            <div className="result-header">
              <div className="result-icon">
                {correctCount === questions.length ? '🏆' : correctCount >= questions.length * 0.8 ? '🎉' : correctCount >= questions.length * 0.6 ? '👍' : '💪'}
              </div>
              <h3>{isExamMode ? '考试完成！' : '练习完成！'}</h3>
            </div>

            <div className="result-stats">
              <div className="stat-item">
                <div className="stat-value correct">{correctCount}</div>
                <div className="stat-label">正确</div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <div className="stat-value wrong">{questions.length - correctCount}</div>
                <div className="stat-label">错误</div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <div className="stat-value time">{formatTime(timer)}</div>
                <div className="stat-label">用时</div>
              </div>
            </div>

            <div className="result-score">
              <div className="score-circle">
                <span className="score-value">{Math.round((correctCount / questions.length) * 100)}</span>
                <span className="score-unit">分</span>
              </div>
            </div>

            <div className="result-actions">
              {questions.length - correctCount > 0 && (
                <button className="action-btn review" onClick={() => setMode('wrong')}>
                  📖 查看错题
                </button>
              )}
              <button className="action-btn retry" onClick={() => { setMode('menu'); setIsExamMode(false); }}>
                🔄 继续练习
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}