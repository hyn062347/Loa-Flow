import { useState } from 'react'
import './App.css'

type SaveStatus = 'idle' | 'loading' | 'success' | 'error'

function App() {
  const [categoryCode, setCategoryCode] = useState('50000')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!categoryCode.trim()) {
      setError('카테고리 코드를 입력하세요.')
      setStatus('error')
      return
    }

    const parsedCategory = Number(categoryCode.trim())
    if (Number.isNaN(parsedCategory)) {
      setError('숫자만 입력하세요.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/.netlify/functions/saveItemPrice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoryCode: parsedCategory }),
      })

      if (!res.ok) {
        const message = await res.text().catch(() => res.statusText)
        throw new Error(message || '저장 요청에 실패했습니다.')
      }

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    }
  }

  return (
    <>
      <div className='main_container'>
        <h1 className='main_title'>LOA FLOW</h1>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            카테고리 코드
          </label>
          <input
            type='number'
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            placeholder='예) 50000'
            style={{ padding: '0.5rem', width: '200px' }}
          />
        </div>

        <button
          type='button'
          onClick={handleSave}
          disabled={status === 'loading'}
          style={{ marginTop: '0.75rem', padding: '0.5rem 1rem' }}
        >
          {status === 'loading' ? '저장 중...' : '가격 저장 요청'}
        </button>

        {status === 'success' && (
          <p style={{ color: 'green', marginTop: '0.75rem' }}>저장 요청을 보냈습니다.</p>
        )}
        {status === 'error' && error && (
          <p style={{ color: 'red', marginTop: '0.75rem' }}>{error}</p>
        )}
      </div>
    </>
  )
}

export default App
