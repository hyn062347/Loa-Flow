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
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1) // 👈 현재 선택된 인덱스
  const containerRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      setOpen(false)
      setHighlightIndex(-1)
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setOpen(true)
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
        // 새 목록이 생기면 첫 번째를 하이라이트
        setHighlightIndex(data.length > 0 ? 0 : -1)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSuggestions([])
          setHighlightIndex(-1)
        }
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlightIndex(-1)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const hasQuery = Boolean(query.trim())
  const showSuggestions = open && (loading || hasQuery)

  const handleSelect = (name: string) => {
    setQuery(name)
    setOpen(false)
    setHighlightIndex(-1)
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    // 드롭다운이 닫혀 있거나, 로딩 중이면 키보드 네비 무시
    if (!open || loading) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => {
        if (suggestions.length === 0) return -1
        const next = prev + 1
        return next >= suggestions.length ? 0 : next
      })
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => {
        if (suggestions.length === 0) return -1
        if (prev <= 0) return suggestions.length - 1
        return prev - 1
      })
    }

    if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        e.preventDefault()
        const selected = suggestions[highlightIndex]
        handleSelect(selected.name)
      }
    }

    if (e.key === 'Escape') {
      setOpen(false)
      setHighlightIndex(-1)
    }
  }

  return (
    <div className='search-bar' ref={containerRef}>
      <input
        type='text'
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown} // 👈 키보드 이벤트 연결
        placeholder='아이템 이름을 검색하세요'
      />
      {showSuggestions && (
        <div className='suggestions'>
          {loading && <div className='suggestion-row muted'>불러오는 중...</div>}
          {!loading && suggestions.length === 0 && query.trim() && (
            <div className='suggestion-row muted'>검색 결과가 없습니다.</div>
          )}
          {!loading &&
            suggestions.map((s, index) => (
              <div
                className={`suggestion-row ${
                  index === highlightIndex ? 'active' : ''
                }`}
                key={s.id}
                onMouseDown={() => handleSelect(s.name)}
                onMouseEnter={() => setHighlightIndex(index)} // 마우스 올리면 하이라이트 이동
              >
                {s.name}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}