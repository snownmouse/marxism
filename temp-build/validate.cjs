const fs = require('fs')
const path = require('path')
const dir = path.join(__dirname, 'src', 'data')

const glossary = JSON.parse(fs.readFileSync(path.join(dir, 'glossary.json'), 'utf-8'))
const dialogs = JSON.parse(fs.readFileSync(path.join(dir, 'dialogs.json'), 'utf-8'))
const stages = JSON.parse(fs.readFileSync(path.join(dir, 'stages.json'), 'utf-8'))
const glossaryIds = new Set(glossary.map(g => g.id))

let errors = 0

for (const d of dialogs) {
  if (d.glossaryId && !glossaryIds.has(d.glossaryId)) {
    console.log(`❌ 对话 ${d.id}: glossaryId "${d.glossaryId}" 不存在`)
    errors++
  }
  const stage = stages.find(s => s.id === d.stageId)
  if (!stage) {
    console.log(`❌ 对话 ${d.id}: stageId ${d.stageId} 不存在`)
    errors++
    continue
  }
}

for (const s of stages) {
  for (const did of s.citizenDialogs) {
    const d = dialogs.find(d => d.id === did)
    if (!d) {
      console.log(`❌ 阶段${s.id}(${s.name}): dialogId "${did}" 不存在`)
      errors++
      continue
    }
    if (d.stageId !== s.id) {
      console.log(`⚠️  阶段${s.id}(${s.name}): 对话"${did}"的stageId=${d.stageId}，不匹配`)
      errors++
    }
  }
}

console.log(`\n总计: ${dialogs.length}条对话, ${glossary.length}条术语, ${stages.length}个阶段`)
const dialogIds = new Set(dialogs.map(d => d.id))
const refCount = stages.reduce((sum, s) => sum + s.citizenDialogs.length, 0)
console.log(`引用对话: ${refCount}条(去重${new Set(stages.flatMap(s => s.citizenDialogs)).size}条)`)

const orphaned = dialogs.filter(d => !d.chatType && !stages.some(s => s.citizenDialogs.includes(d.id)))
if (orphaned.length > 0) {
  console.log(`⚠️  未被任何阶段引用的教育对话(${orphaned.length}条):`)
  orphaned.forEach(d => console.log(`   - ${d.id} (stageId=${d.stageId}, text="${d.text.slice(0,20)}...")`))
}

if (errors === 0) console.log('✅ 全部数据验证通过')
else console.log(`\n❌ 共${errors}个错误`)