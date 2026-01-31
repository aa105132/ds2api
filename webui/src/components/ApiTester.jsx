import { useState, useRef, useEffect } from 'react'

const MODELS = [
    { id: 'deepseek-chat', name: 'deepseek-chat' },
    { id: 'deepseek-reasoner', name: 'deepseek-reasoner' },
    { id: 'deepseek-chat-search', name: 'deepseek-chat-search' },
    { id: 'deepseek-reasoner-search', name: 'deepseek-reasoner-search' },
]

export default function ApiTester({ config, onMessage, authFetch }) {
    const [model, setModel] = useState('deepseek-chat')
    const [message, setMessage] = useState('你好，请用一句话介绍你自己。')
    const [apiKey, setApiKey] = useState('')
    const [selectedAccount, setSelectedAccount] = useState('')  // 空为随机
    const [response, setResponse] = useState(null)
    const [loading, setLoading] = useState(false)
    const [streamingContent, setStreamingContent] = useState('')
    const [streamingThinking, setStreamingThinking] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const abortControllerRef = useRef(null)

    // 使用 authFetch 或回退到普通 fetch（admin API 用 authFetch，OpenAI 兼容 API 用普通 fetch）
    const apiFetch = authFetch || fetch

    // 获取账号列表
    const accounts = config.accounts || []

    const testApi = async () => {
        // ... (保留旧的 server-side test作为备用，或者完全移除？保留吧但不使用)
    }

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setLoading(false)
        setIsStreaming(false)
    }

    const directTest = async () => {
        if (loading) return

        setLoading(true)
        setIsStreaming(true)
        setResponse(null)
        setStreamingContent('')
        setStreamingThinking('')

        abortControllerRef.current = new AbortController()

        try {
            const key = apiKey || (config.keys?.[0] || '')
            if (!key) {
                onMessage('error', '请提供 API Key')
                setLoading(false)
                setIsStreaming(false)
                return
            }

            const res = await fetch('/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: message }],
                    stream: true,
                }),
                signal: abortControllerRef.current.signal,
            })

            if (!res.ok) {
                const data = await res.json()
                setResponse({ success: false, error: data.error?.message || '请求失败' })
                onMessage('error', data.error?.message || '请求失败')
                setLoading(false)
                setIsStreaming(false)
                return
            }

            setResponse({ success: true, status_code: res.status })

            // 处理流式响应
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed || !trimmed.startsWith('data: ')) continue

                    const dataStr = trimmed.slice(6)
                    if (dataStr === '[DONE]') continue

                    try {
                        const json = JSON.parse(dataStr)
                        const choice = json.choices?.[0]
                        if (choice?.delta) {
                            const delta = choice.delta

                            // DeepSeek 官方格式使用 reasoning_content 表示思考内容
                            if (delta.reasoning_content) {
                                setStreamingThinking(prev => prev + delta.reasoning_content)
                            }
                            // 正常内容
                            if (delta.content) {
                                setStreamingContent(prev => prev + delta.content)
                            }
                        }
                    } catch (e) {
                        console.error('Invalid JSON hunk:', dataStr, e)
                    }
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                onMessage('info', '已停止生成')
            } else {
                onMessage('error', '网络错误: ' + e.message)
                setResponse({ error: e.message, success: false })
            }
        } finally {
            setLoading(false)
            setIsStreaming(false)
            abortControllerRef.current = null
        }
    }

    // 智能测试：根据是否选择账号决定测试方式
    const sendTest = async () => {
        // 如果选择了指定账号，使用账号测试接口（暂时保持非流式，或者后续改为支持流式）
        if (selectedAccount) {
            setLoading(true)
            setResponse(null)
            try {
                const res = await apiFetch('/admin/accounts/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identifier: selectedAccount,
                        model,
                        message,
                    }),
                })
                const data = await res.json()
                setResponse({
                    success: data.success,
                    status_code: res.status,
                    response: data,
                    account: selectedAccount,
                })
                if (data.success) {
                    onMessage('success', `${selectedAccount}: 测试成功 (${data.response_time}ms)`)
                } else {
                    onMessage('error', `${selectedAccount}: ${data.message}`)
                }
            } catch (e) {
                onMessage('error', '网络错误: ' + e.message)
                setResponse({ error: e.message })
            } finally {
                setLoading(false)
            }
            return
        }

        // 随机账号：使用标准 API (流式)
        directTest()
    }

    return (
        <div className="section">
            <div className="card">
                <div className="card-title" style={{ marginBottom: '1rem' }}>🧪 API 测试</div>

                <div className="form-group">
                    <label className="form-label">模型</label>
                    <select
                        className="form-input"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                    >
                        {MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">账号（指定测试哪个账号）</label>
                    <select
                        className="form-input"
                        value={selectedAccount}
                        onChange={e => setSelectedAccount(e.target.value)}
                    >
                        <option value="">🎲 随机选择 (流式)</option>
                        {accounts.map((acc, i) => {
                            const id = acc.email || acc.mobile
                            return <option key={i} value={id}>{id} {acc.has_token ? '✅' : '⚠️'}</option>
                        })}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">API Key（留空使用第一个配置的 Key）</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder={config.keys?.[0] ? `默认: ${config.keys[0].slice(0, 8)}...` : '请先添加 API Key'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">消息内容</label>
                    <textarea
                        className="form-input"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="输入测试消息..."
                        rows={3}
                    />
                </div>

                <div className="btn-group">
                    {loading && isStreaming ? (
                        <button className="btn btn-warning" onClick={stopGeneration}>
                            ⏹ 停止生成
                        </button>
                    ) : (
                        <button className="btn btn-primary" onClick={sendTest} disabled={loading}>
                            {loading ? <span className="loading"></span> :
                                selectedAccount ? `🚀 使用 ${selectedAccount} 发送` : '🚀 发送请求 (流式)'}
                        </button>
                    )}
                </div>
            </div>

            {(response || isStreaming) && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">响应结果</span>
                        {response && (
                            <span className={`badge ${response.success ? 'badge-success' : 'badge-error'}`}>
                                {response.success ? '成功' : '失败'} {response.status_code && `(${response.status_code})`}
                            </span>
                        )}
                    </div>

                    {/* 流式响应显示区域 */}
                    {(streamingContent || streamingThinking || isStreaming) && !selectedAccount ? (
                        <div style={{ marginTop: '1rem' }}>
                            {streamingThinking && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <div className="form-label" style={{ color: '#888' }}>🤔 思考过程:</div>
                                    <div style={{
                                        padding: '1rem',
                                        background: 'rgba(0,0,0,0.05)',
                                        borderLeft: '4px solid #666',
                                        color: '#666',
                                        fontSize: '0.9em',
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: '200px',
                                        overflowY: 'auto'
                                    }}>
                                        {streamingThinking}
                                    </div>
                                </div>
                            )}

                            <div className="form-label">🤖 AI 回复:</div>
                            <div style={{
                                padding: '1rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius)',
                                whiteSpace: 'pre-wrap',
                                minHeight: '60px'
                            }}>
                                {streamingContent}
                                {isStreaming && <span className="cursor-blink">|</span>}
                            </div>
                        </div>
                    ) : (
                        // 非流式响应显示（如JSON或指定账号测试结果）
                        <div className="code-block">
                            {JSON.stringify(response?.response || response?.error || {}, null, 2)}
                        </div>
                    )}

                    {/* 指定账号测试的特定显示 */}
                    {selectedAccount && response?.success && (
                        <>
                            {response.response?.thinking && (
                                <div style={{ marginTop: '1rem' }}>
                                    <div className="form-label" style={{ color: '#888' }}>🤔 思考过程:</div>
                                    <div style={{
                                        padding: '1rem',
                                        background: 'rgba(0,0,0,0.05)',
                                        borderLeft: '4px solid #666',
                                        color: '#666',
                                        fontSize: '0.9em',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {response.response.thinking}
                                    </div>
                                </div>
                            )}
                            {response.response?.message && (
                                <div style={{ marginTop: '1rem' }}>
                                    <div className="form-label">AI 回复 ({response.account})：</div>
                                    <div style={{
                                        padding: '1rem',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius)',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {response.response.message}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            <style>{`
                .cursor-blink {
                    animation: blink 1s step-end infinite;
                }
                @keyframes blink {
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    )
}
