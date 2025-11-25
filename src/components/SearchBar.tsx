import { useEffect, useRef, useState } from 'react'
import './SearchBar.css'

interface Suggestion {
  id: number
  name: string
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: '8' })
        const res = await fetch(`/.netlify/functions/searchItems?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error('검색 실패')
        }
        const data: Suggestion[] = await res.json()
        setSuggestions(data)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSuggestions([])
        }
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  const showSuggestions = loading || (query.trim() && suggestions.length > 0)

  return (
    <div className='search-bar'>
      <input
        type='text'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='아이템 이름을 검색하세요'
      />
      {showSuggestions && (
        <div className='suggestions'>
          {loading && <div className='suggestion-row muted'>불러오는 중...</div>}
          {!loading && suggestions.length === 0 && query.trim() && (
            <div className='suggestion-row muted'>검색 결과가 없습니다.</div>
          )}
          {!loading &&
            suggestions.map((s) => (
              <div className='suggestion-row' key={s.id}>
                {s.name}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
