import re
import json

def parse_markdown_quiz(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    questions = []
    current_topic = ""
    question_id = 1
    
    lines = content.split('\n')
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # 检测专题标题
        if line.startswith('专题'):
            match = re.match(r'专题([一二三四五六七八九十]+)\s*(.*)', line)
            if match:
                current_topic = match.group(2).strip()
                if not current_topic:
                    current_topic = line.replace('专题', '').strip()
            i += 1
            continue
        
        # 单项选择题
        if re.match(r'^一[\.、]单项选择题', line):
            i += 1
            while i < len(lines):
                l = lines[i].strip()
                if re.match(r'^二[\.、]', l) or re.match(r'^三[\.、]', l) or re.match(r'^四[\.、]', l) or l.startswith('专题'):
                    break
                
                # 匹配题号开头
                match = re.match(r'^(\d+)[\.、]\s*(.*)', l)
                if match:
                    q_text = match.group(2).strip()
                    options = []
                    
                    # 收集选项
                    j = i + 1
                    while j < len(lines):
                        opt_line = lines[j].strip()
                        if opt_line.startswith('答案'):
                            break
                        if opt_line:
                            opt_match = re.match(r'^([A-D])[．.、：:\s]\s*(.*)', opt_line)
                            if opt_match:
                                options.append(opt_match.group(2).strip())
                        j += 1
                    
                    # 解析答案
                    answer_line = lines[j].strip() if j < len(lines) else ''
                    answer_match = re.search(r'答案[：:]\s*([A-D])', answer_line)
                    answer = 0
                    explanation = ''
                    
                    if answer_match:
                        answer = ord(answer_match.group(1)) - ord('A')
                        # 提取解析（教材页码等）
                        rest = answer_line.split(answer_match.group(1))[-1] if answer_match.group(1) in answer_line else ''
                        explanation = rest.strip().strip('（）()')
                    
                    if options and len(options) == 4:
                        questions.append({
                            'id': f'q{question_id}',
                            'category': current_topic,
                            'type': 'single',
                            'question': q_text,
                            'options': options,
                            'answer': answer,
                            'explanation': explanation,
                            'relatedCards': []
                        })
                        question_id += 1
                    i = j
                i += 1
            continue
        
        # 多项选择题
        if re.match(r'^二[\.、]多项选择题', line):
            i += 1
            while i < len(lines):
                l = lines[i].strip()
                if re.match(r'^三[\.、]', l) or re.match(r'^四[\.、]', l) or l.startswith('专题'):
                    break
                
                # 匹配题号开头
                match = re.match(r'^(\d+)[\.、]\s*(.*)', l)
                if match:
                    q_text = match.group(2).strip()
                    options = []
                    
                    # 收集选项
                    j = i + 1
                    while j < len(lines):
                        opt_line = lines[j].strip()
                        if opt_line.startswith('答案'):
                            break
                        if opt_line:
                            opt_match = re.match(r'^([A-D])[．.、：:\s]\s*(.*)', opt_line)
                            if opt_match:
                                options.append(opt_match.group(2).strip())
                        j += 1
                    
                    # 解析答案（多选）
                    answer_line = lines[j].strip() if j < len(lines) else ''
                    answer_match = re.search(r'答案[：:]\s*([A-D]+)', answer_line)
                    answers = []
                    explanation = ''
                    
                    if answer_match:
                        answers = [ord(c) - ord('A') for c in answer_match.group(1)]
                        rest = answer_line.split(answer_match.group(1))[-1] if answer_match.group(1) in answer_line else ''
                        explanation = rest.strip().strip('（）()')
                    
                    if options and len(options) == 4 and answers:
                        questions.append({
                            'id': f'q{question_id}',
                            'category': current_topic,
                            'type': 'multiple',
                            'question': q_text,
                            'options': options,
                            'answer': answers,
                            'explanation': explanation,
                            'relatedCards': []
                        })
                        question_id += 1
                    i = j
                # 处理没有题号的多选题（题目直接开始）
                elif l and not l.startswith('答案') and not re.match(r'^[A-D][．.、]', l):
                    q_text = l
                    options = []
                    
                    j = i + 1
                    while j < len(lines):
                        opt_line = lines[j].strip()
                        if opt_line.startswith('答案'):
                            break
                        if opt_line:
                            opt_match = re.match(r'^([A-D])[．.、：:\s]\s*(.*)', opt_line)
                            if opt_match:
                                options.append(opt_match.group(2).strip())
                        j += 1
                    
                    answer_line = lines[j].strip() if j < len(lines) else ''
                    answer_match = re.search(r'答案[：:]\s*([A-D]+)', answer_line)
                    answers = []
                    
                    if answer_match:
                        answers = [ord(c) - ord('A') for c in answer_match.group(1)]
                    
                    if options and len(options) == 4 and answers:
                        questions.append({
                            'id': f'q{question_id}',
                            'category': current_topic,
                            'type': 'multiple',
                            'question': q_text,
                            'options': options,
                            'answer': answers,
                            'explanation': '',
                            'relatedCards': []
                        })
                        question_id += 1
                    i = j
                i += 1
            continue
        
        # 辨析题 - 转换为判断题
        if re.match(r'^三[\.、]辨析题', line):
            i += 1
            while i < len(lines):
                l = lines[i].strip()
                if re.match(r'^四[\.、]', l) or l.startswith('专题'):
                    break
                
                match = re.match(r'^(\d+)[\.、]\s*(.*)', l)
                if match:
                    q_text = match.group(2).strip()
                    
                    # 查找答案
                    j = i + 1
                    answer_text = ''
                    while j < len(lines):
                        ans_line = lines[j].strip()
                        if ans_line.startswith('答案'):
                            answer_text = ans_line
                            break
                        if re.match(r'^\d+[\.、]', ans_line):
                            break
                        j += 1
                    
                    # 判断正确还是错误
                    is_correct = '正确' in answer_text or '对' in answer_text
                    
                    # 提取解析
                    explanation = answer_text.replace('答案：', '').replace('答案:', '').strip()
                    
                    questions.append({
                        'id': f'q{question_id}',
                        'category': current_topic,
                        'type': 'judge',
                        'question': q_text,
                        'options': ['正确', '错误'],
                        'answer': 0 if is_correct else 1,
                        'explanation': explanation,
                        'relatedCards': []
                    })
                    question_id += 1
                    i = j
                i += 1
            continue
        
        i += 1
    
    return questions

if __name__ == '__main__':
    questions = parse_markdown_quiz('马理论题库.md')
    
    # 统计
    categories = {}
    types = {'single': 0, 'multiple': 0, 'judge': 0}
    for q in questions:
        cat = q['category']
        categories[cat] = categories.get(cat, 0) + 1
        types[q['type']] += 1
    
    print(f'解析完成，共 {len(questions)} 道题目')
    print(f'\n题型分布:')
    print(f'  单选题: {types["single"]} 道')
    print(f'  多选题: {types["multiple"]} 道')
    print(f'  判断题: {types["judge"]} 道')
    print(f'\n章节分布:')
    for cat, count in categories.items():
        print(f'  {cat}: {count} 道')
    
    with open('src/data/quizQuestions.json', 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    
    print('\n题库已保存到 src/data/quizQuestions.json')